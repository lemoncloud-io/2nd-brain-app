// vault_verify.py 의 TypeScript 이식 — 병합 전 마지막 결정론 검증(메모리 크기·마커, 레인 흔적, raw/archive
// append-only, frontmatter 구조, next_action 모양, 볼륨 줄). 원본: resources/vault-kit/projects/second-brain/config/scripts/vault_verify.py.
// 앱이 Python 없이 돌도록 옮겼다 — Windows 에는 python 이 없고 새 Mac 은 설치 안내 스텁뿐이다.
// 판정·문구가 원본과 같다는 근거는 vault-verify.test.ts 가 같은 볼트에 둘을 돌려 대조한다.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { gitRuntime } from '../git'
import { checkVolume, MEMORY_REL, splitLines } from './vault-volume'
import { mainT } from '../i18n'

export type VerifyOutcome =
  | { status: 'pass' }
  | { status: 'fail'; defects: string[] }
  | { status: 'unavailable'; reason: string }

/** 'ingest' = 병합 전 검증, 'none' = Lint 탭 구조 점검 */
export type VerifyLane = 'ingest' | 'none'

const MEMORY_MAX_BYTES = 8192
const MARKER_MAX_BYTES = 200
const APPEND_ONLY_DIRS = ['raw', 'archive']
export const EXPECTED_DIRS = ['wiki', 'raw', 'Clippings', 'templates']
const MARKER_RE = /^- (Last [^:]+):/
const LANE_TRACE = { prefix: 'outputs/runs/', kind: 'ingest' }

const FM_FENCE = '---'
const FM_KEY_RE = /^(\s*)(?![\s#-])([^:]+?):(?:\s+(.*))?\s*$/
const FM_SEQ_RE = /^(\s*)-(?:\s+(.*))?\s*$/
const FM_BLOCK_RE = /^[|>][+-]?\d*$/
const FRONTMATTER_SKIP_DIRS = ['raw/', 'archive/']
const NEXT_ACTION_MAX_BYTES = 300
// s 플래그: 원본 `.` 처럼 U+2028·U+2029 도 받는다(줄은 이미 \n 으로 나눴다)
const NA_KEY_RE = /^next_action:(?:[ \t]+(.*?))?[ \t]*$/s
const NA_ITEM_RE = /^[ \t]+-[ \t]+(.*?)[ \t]*$/s
const NA_DOC = 'docs/project-next-action.md'
const GIT_TIMEOUT_MS = 60_000

const utf8 = new TextDecoder('utf-8', { fatal: true })

const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile()
const isDir = (path: string): boolean => existsSync(path) && statSync(path).isDirectory()

type GitRun = { code: number | null; stdout: string; stderr: string; error?: Error }

const runGit = (vault: string, args: string[]): GitRun => {
  const { file, env } = gitRuntime()
  const result = spawnSync(file, args, {
    cwd: vault,
    env,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true
  })
  return {
    code: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error
  }
}

const firstStderrLine = (run: GitRun, fallback: string): string =>
  run.stderr.trim() ? splitLines(run.stderr.trim())[0]! : fallback

const resolveVault = (dir: string): string | null => {
  const candidate = resolve(dir)
  if (!existsSync(join(candidate, 'VAULT_RULES.md'))) return null
  return EXPECTED_DIRS.every((d) => isDir(join(candidate, d))) ? candidate : null
}

const checkMemory = (vault: string, defects: string[]): void => {
  const memory = join(vault, MEMORY_REL)
  if (!isFile(memory)) {
    defects.push(`${MEMORY_REL} is missing`)
    return
  }
  const size = statSync(memory).size
  if (size >= MEMORY_MAX_BYTES) {
    defects.push(`${MEMORY_REL} is ${size} bytes (must stay under ${MEMORY_MAX_BYTES})`)
  }
  const counts = new Map<string, number>()
  splitLines(readFileSync(memory, 'utf8')).forEach((line, index) => {
    const match = MARKER_RE.exec(line)
    if (!match) return
    const name = match[1]!
    counts.set(name, (counts.get(name) ?? 0) + 1)
    const bytes = Buffer.byteLength(line, 'utf8')
    if (bytes > MARKER_MAX_BYTES) {
      defects.push(
        `${MEMORY_REL}:${index + 1} \`- ${name}:\` line is ${bytes} bytes ` +
          `(max ${MARKER_MAX_BYTES}); detail belongs in the run-log note`
      )
    }
  })
  for (const [name, count] of [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (count > 1) {
      defects.push(
        `${MEMORY_REL} has ${count} \`- ${name}:\` lines; the line is replaced, never appended`
      )
    }
  }
}

// base 대비 추가·수정 경로 + untracked (커밋 전에 검증하는 레인도 있다)
const changedPaths = (vault: string, base: string): string[] | null => {
  const diff = runGit(vault, ['diff', '--name-status', base, '--', 'outputs'])
  const untracked = runGit(vault, ['ls-files', '--others', '--exclude-standard', '--', 'outputs'])
  if (diff.code !== 0 || untracked.code !== 0) return null
  const paths: string[] = []
  for (const line of splitLines(diff.stdout)) {
    const tab = line.indexOf('\t')
    const status = tab === -1 ? line : line.slice(0, tab)
    const rest = tab === -1 ? '' : line.slice(tab + 1)
    if (['A', 'M', 'R'].includes(status.slice(0, 1))) paths.push(rest.split('\t').pop()!)
  }
  paths.push(...splitLines(untracked.stdout).filter((p) => p.trim()))
  return paths
}

const checkLaneTrace = (vault: string, base: string, lane: VerifyLane, defects: string[]): void => {
  if (lane === 'none') return
  const paths = changedPaths(vault, base)
  if (paths === null) {
    defects.push(`lane trace check could not run for ${lane} (git diff against ${base} failed)`)
    return
  }
  const kindRe = new RegExp(`^kind:\\s*${LANE_TRACE.kind}\\s*$`, 'm')
  for (const rel of paths) {
    if (!(rel.startsWith(LANE_TRACE.prefix) && rel.endsWith('.md'))) continue
    let head: string
    try {
      head = utf8.decode(readFileSync(join(vault, rel))).slice(0, 2000)
    } catch {
      continue
    }
    if (kindRe.test(head)) return
  }
  defects.push(
    `no outputs/runs/ run-log with \`kind: ${LANE_TRACE.kind}\` added or modified against ${base} after a ${lane} run`
  )
}

// 따옴표 스칼라가 같은 줄에서 열리고 닫히는가(따옴표 없으면 참)
const closesQuote = (value: string): boolean => {
  if (!value || !`"'`.includes(value[0]!)) return true
  const rest = value.slice(1)
  if (value[0] === "'") return rest.trimEnd().endsWith("'")
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '\\') {
      index += 1
      continue
    }
    if (rest[index] === '"') return true
  }
  return false
}

const pyTypeName = (value: unknown): string => {
  if (Array.isArray(value)) return 'list'
  if (typeof value === 'string') return 'str'
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float'
  return typeof value
}

/**
 * 어떤 YAML 파서도 받을 수 없는 frontmatter 모양을 알린다(원본 scan_frontmatter).
 * 구조 점검에서 결함이 없을 때만 전체 파싱을 얹는다 — 원본의 PyYAML 경로에 해당한다.
 */
export const scanFrontmatter = (text: string, relPath: string): string[] => {
  if (!text.startsWith(`${FM_FENCE}\n`)) return []
  const lines = text.split('\n')
  let end: number | null = null
  for (let index = 1; index < lines.length; index += 1) {
    const trimmed = lines[index]!.trimEnd()
    if (trimmed === FM_FENCE || trimmed === '...') {
      end = index
      break
    }
  }
  if (end === null) return [`${relPath}: unterminated frontmatter (no closing \`---\`)`]

  const defects: string[] = []
  const scopes: Array<[indent: number, keys: Set<string>]> = []
  let lastKey: [indent: number, key: string] | null = null
  let blockIndent: number | null = null
  let openQuote: string | null = null

  for (let offset = 1; offset < end; offset += 1) {
    const line = lines[offset]!
    const lineno = offset + 1

    if (openQuote !== null) {
      if (line.includes(openQuote)) openQuote = null
      continue
    }
    if (!line.trim()) continue

    const indent = line.length - line.replace(/^[ \t]+/, '').length
    if (line.slice(0, indent).includes('\t')) {
      defects.push(`${relPath}:${lineno} tab used for indentation (YAML forbids tabs)`)
      continue
    }
    if (blockIndent !== null) {
      if (indent > blockIndent) continue
      blockIndent = null
    }
    if (line.trimStart().startsWith('#')) continue

    const seq = FM_SEQ_RE.exec(line)
    if (seq) {
      if (lastKey !== null && indent > lastKey[0]) {
        defects.push(
          `${relPath}:${lineno} sequence item is indented under \`${lastKey[1]}:\`, ` +
            'which already has a scalar value — a merge conflict resolved by keeping ' +
            'both sides leaves exactly this shape'
        )
      }
      while (scopes.length > 0 && scopes[scopes.length - 1]![0] > indent) scopes.pop()
      // 항목마다 매핑 스코프가 새로 열린다 — `- name:` 은 항목 사이에서 반복돼도 된다
      scopes.push([indent + 1, new Set()])
      lastKey = null
      const inline = (seq[2] ?? '').trim()
      if (inline.endsWith(':')) scopes[scopes.length - 1]![1].add(inline.slice(0, -1).trim())
      continue
    }

    const keyMatch = FM_KEY_RE.exec(line)
    if (!keyMatch) continue

    const key = keyMatch[2]!.trim()
    const value = (keyMatch[3] ?? '').trim()

    while (scopes.length > 0 && scopes[scopes.length - 1]![0] > indent) scopes.pop()
    if (scopes.length === 0 || scopes[scopes.length - 1]![0] < indent)
      scopes.push([indent, new Set()])
    const scope = scopes[scopes.length - 1]![1]
    if (scope.has(key)) {
      defects.push(
        `${relPath}:${lineno} duplicate key \`${key}\` at the same level — ` +
          'the later value silently wins, or the block fails to parse'
      )
    }
    scope.add(key)

    if (FM_BLOCK_RE.test(value)) {
      blockIndent = indent
      lastKey = null
    } else if (!value) {
      lastKey = null
    } else if (!closesQuote(value)) {
      openQuote = value[0]!
      lastKey = null
    } else {
      lastKey = [indent, key]
    }
  }

  if (defects.length > 0) return defects

  let parsed: unknown
  try {
    parsed = parseYaml(lines.slice(1, end).join('\n'), { logLevel: 'error' })
  } catch (error) {
    const detail = (error instanceof Error ? error.message : String(error))
      .replace(/\n/g, ' ')
      .trim()
    return [`${relPath}: frontmatter is not valid YAML — ${detail}`]
  }
  if (
    parsed !== null &&
    parsed !== undefined &&
    (typeof parsed !== 'object' || Array.isArray(parsed))
  ) {
    return [`${relPath}: frontmatter must be a mapping, got ${pyTypeName(parsed)}`]
  }
  return []
}

/** 따옴표 한 겹을 벗긴다 — 상한은 문법이 아니라 글을 잰다 */
const naUnquote = (value: string): string =>
  value.length >= 2 &&
  value[0] === value[value.length - 1] &&
  (value[0] === '"' || value[0] === "'")
    ? value.slice(1, -1)
    : value

const naItemDefects = (relPath: string, lineno: number, where: string, text: string): string[] => {
  const defects: string[] = []
  const size = Buffer.byteLength(text, 'utf8')
  if (size > NEXT_ACTION_MAX_BYTES) {
    defects.push(
      `${relPath}:${lineno} next_action ${where} is ${size} bytes ` +
        `(max ${NEXT_ACTION_MAX_BYTES}) — one action per item, detail in the body (${NA_DOC})`
    )
  }
  if (text.includes(';')) {
    defects.push(
      `${relPath}:${lineno} next_action ${where} uses ';' to join clauses — ` +
        `each clause is its own sequence item (${NA_DOC})`
    )
  }
  return defects
}

/**
 * 한 문자열에 할 일을 여럿 담은 `next_action` 을 알린다(원본 scan_next_action).
 * 인용 스칼라 하나 또는 한 줄에 한 건인 블록 시퀀스만 받는다. 구조 결함이 없는 파일에만 부른다.
 */
export const scanNextAction = (text: string, relPath: string): string[] => {
  if (!text.startsWith(`${FM_FENCE}\n`)) return []
  const lines = text.split('\n')
  let end: number | null = null
  for (let index = 1; index < lines.length; index += 1) {
    const trimmed = lines[index]!.trimEnd()
    if (trimmed === FM_FENCE || trimmed === '...') {
      end = index
      break
    }
  }
  if (end === null) return [] // scanFrontmatter 가 알린다

  let keyAt: number | null = null
  let value = ''
  for (let offset = 1; offset < end; offset += 1) {
    const match = NA_KEY_RE.exec(lines[offset]!)
    if (match) {
      keyAt = offset
      value = (match[1] ?? '').trim()
      break
    }
  }
  if (keyAt === null) return []
  const lineno = keyAt + 1

  if (value) {
    if (value.startsWith('[')) {
      if (value.replace(/ /g, '') === '[]') return []
      return [
        `${relPath}:${lineno} next_action must be a quoted scalar or a block sequence, ` +
          `not an inline flow sequence — one item per line (${NA_DOC})`
      ]
    }
    if (FM_BLOCK_RE.test(value)) {
      return [
        `${relPath}:${lineno} next_action must be a quoted scalar or a block sequence, ` +
          `not a block scalar — a value with line breaks is unreadable in the base ` +
          `table cell (${NA_DOC})`
      ]
    }
    return naItemDefects(relPath, lineno, 'scalar', naUnquote(value))
  }

  const defects: string[] = []
  let itemNo = 0
  for (let offset = keyAt + 1; offset < end; offset += 1) {
    const line = lines[offset]!
    if (!line.trim()) continue
    const item = NA_ITEM_RE.exec(line)
    if (!item) break // 0열 키가 시퀀스를 끝낸다. 그 밖의 모양은 판정하지 않는다
    itemNo += 1
    defects.push(...naItemDefects(relPath, offset + 1, `item ${itemNo}`, naUnquote(item[1]!)))
  }
  return defects
}

const checkFrontmatter = (vault: string, defects: string[]): void => {
  const listed = runGit(vault, ['ls-files', '-z', '*.md'])
  if (listed.error) {
    defects.push(`frontmatter check could not run: ${listed.error.message}`)
    return
  }
  if (listed.code !== 0) {
    defects.push(
      `frontmatter check could not run: ${firstStderrLine(listed, 'git ls-files failed')}`
    )
    return
  }
  for (const rel of listed.stdout.split('\0')) {
    if (!rel || FRONTMATTER_SKIP_DIRS.some((dir) => rel.startsWith(dir))) continue
    const path = join(vault, rel)
    if (!isFile(path)) continue // 스테이징된 삭제
    let text: string
    try {
      // 원본 read_text 처럼 줄 끝을 \n 하나로 — Windows 에서 쓴 CRLF 페이지도 같은 판정을 받는다
      text = utf8.decode(readFileSync(path)).replace(/\r\n?/g, '\n')
    } catch (error) {
      defects.push(`${rel}: could not read for the frontmatter check (${String(error)})`)
      continue
    }
    const structural = scanFrontmatter(text, rel)
    defects.push(...structural)
    // 읽히지 않는 블록에서는 next_action 판정이 뜻이 없다
    if (structural.length === 0) defects.push(...scanNextAction(text, rel))
  }
}

const checkAppendOnly = (vault: string, base: string, defects: string[]): void => {
  const existing = APPEND_ONLY_DIRS.filter((dir) => existsSync(join(vault, dir)))
  if (existing.length === 0) return
  const diff = runGit(vault, ['diff', '--name-status', base, '--', ...existing])
  if (diff.error) {
    defects.push(`append-only check could not run: ${diff.error.message}`)
    return
  }
  if (diff.code !== 0) {
    defects.push(`append-only check could not run: ${firstStderrLine(diff, 'git diff failed')}`)
    return
  }
  for (const line of splitLines(diff.stdout)) {
    if (!line.trim()) continue
    const tab = line.indexOf('\t')
    const status = tab === -1 ? line : line.slice(0, tab)
    const rest = tab === -1 ? '' : line.slice(tab + 1)
    if (status.startsWith('A')) continue // 새 스냅샷만 허용된다
    defects.push(`append-only violation (${status}): ${rest.replaceAll('\t', ' -> ')}`)
  }
}

/** 원본 main() 과 같은 순서로 점검한다. 볼트 루트가 아니면 검증 불가(원본 exit 2) */
export const verifyVault = ({
  vaultDir,
  base,
  lane = 'ingest'
}: {
  vaultDir: string
  base: string
  lane?: VerifyLane
}): VerifyOutcome => {
  const vault = resolveVault(vaultDir)
  if (vault === null) {
    return {
      status: 'unavailable',
      reason: mainT().engineMain.notVaultFolder(EXPECTED_DIRS.join(', '))
    }
  }
  const ref = base.trim() || 'HEAD'
  const defects: string[] = []
  checkMemory(vault, defects)
  checkLaneTrace(vault, ref, lane, defects)
  checkAppendOnly(vault, ref, defects)
  checkFrontmatter(vault, defects)
  defects.push(...checkVolume(vault))
  return defects.length > 0 ? { status: 'fail', defects } : { status: 'pass' }
}
