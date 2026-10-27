// 위키화 준비(결정론) — 에이전트가 하던 앞부분을 코드가 한다.
// 작업 브랜치 → 클리핑 읽기 → 파일명 정규화 → URL 중복 검사 → raw/ 이동 → 시작 커밋.
// 내용은 손대지 않는다(이동만). LLM 은 이후에 초안만 쓴다.
// 되감기는 그 역연산이다 — 페이지가 커밋되기 전의 작업 브랜치를 지우고 자료를 대기함으로 돌려놓는다.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { git } from '../git'
import { sha256 } from '../note/note-run-pure'
import { normalizeRawName } from './raw-name'
import { saveEdits } from '../vault/sync-service'
import { claimUniquePath } from '../clip/clip-service'
import {
  defaultBranchOf,
  isWorkBranch,
  pendingClippings,
  prepareIngest,
  type Checked
} from '../engine/work-branch'
import { mainT } from '../i18n'

export type PreparedClipping = {
  /** Clippings/ 원 이름 */
  clippingName: string
  /** raw/ 정규화 이름 */
  rawName: string
  title: string
  source?: string
  /** source URL 이 이미 있던 raw 이름 — 있으면 기존 노트 갱신 경로 */
  duplicateOf?: string
  /** duplicateOf 를 sources 에 인용하는 wiki rel — 갱신 대상 */
  updateTargets: string[]
  /** 원문 본문(frontmatter 제외) — LLM 초안 재료 */
  body: string
  /** 클리핑 전문 sha256 — 같은 내용 재실행 스킵용 */
  sha: string
  /** raw/ 에 같은 내용이 이미 있으면 LLM 호출을 건너뛴다 (raw 이동·이력은 그대로) */
  skipDraft: boolean
}

export type Prepared = {
  branch: string
  defaultBranch: string
  head: string
  authorSlug: string
  date: string
  clippings: PreparedClipping[]
}

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[ _]+/g, '-')
    .replace(/[^a-z0-9가-힣-]/g, '') || 'note'

const authorOf = (vaultDir: string): string => {
  try {
    const name = git(vaultDir, ['config', 'user.name']).trim()
    if (name) return slugify(name)
  } catch {
    // 설정 없음 — whoami 로
  }
  return slugify(userInfo().username || 'note')
}

const frontmatterOf = (text: string): Record<string, unknown> => {
  if (!text.startsWith('---\n')) return {}
  const close = text.indexOf('\n---', 4)
  if (close === -1) return {}
  try {
    const parsed: unknown = parseYaml(text.slice(4, close))
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const strOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

const bodyOf = (text: string): string => {
  if (!text.startsWith('---\n')) return text
  const close = text.indexOf('\n---', 4)
  return close === -1 ? text : text.slice(close + 4).replace(/^\n/, '')
}

/**
 * raw/ 한 번 읽기 — source URL 목록과 전문 sha 집합을 같이 만든다.
 * 위키화 준비마다 raw/를 두 번 읽지 않게 (스킵 판정용).
 */
const rawIndex = (vaultDir: string): { sources: Map<string, string>; shas: Set<string> } => {
  const sources = new Map<string, string>()
  const shas = new Set<string>()
  let names: string[] = []
  try {
    names = readdirSync(join(vaultDir, 'raw')).filter(
      (n) => n.endsWith('.md') && !n.startsWith('.')
    )
  } catch {
    return { sources, shas }
  }
  for (const name of names) {
    let text: string
    try {
      text = readFileSync(join(vaultDir, 'raw', name), 'utf8')
    } catch {
      continue
    }
    shas.add(sha256(text))
    const source = strOf(frontmatterOf(text)['source'])
    if (source && !sources.has(source)) sources.set(source, name)
  }
  return { sources, shas }
}

const wikiFiles = (vaultDir: string): string[] => {
  const out: string[] = []
  const collect = (dir: string, prefix: string): void => {
    let names: string[] = []
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const name of names) {
      if (name.startsWith('.')) continue
      const full = join(dir, name)
      let isDir = false
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        continue
      }
      if (isDir) collect(full, `${prefix}${name}/`)
      else if (name.endsWith('.md')) out.push(`${prefix}${name}`)
    }
  }
  collect(join(vaultDir, 'wiki'), 'wiki/')
  return out
}

/** raw 이름을 sources 에 인용하는 wiki 문서 — `"raw/<name>.md"` 정확히 일치.
 *  texts는 위키 전체를 한 번 읽은 (rel, 본문) 목록 — 중복 클리핑마다 전수 재스캔하지 않는다. */
const citingNotes = (texts: Array<{ rel: string; text: string }>, rawName: string): string[] => {
  const needle = `"raw/${rawName}"`
  return texts
    .filter(({ rel }) => !rel.startsWith('wiki/topics/'))
    .filter(({ text }) => text.includes(needle))
    .map(({ rel }) => rel)
}

const hasBranch = (vaultDir: string, name: string): boolean => {
  try {
    git(vaultDir, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`])
    return true
  } catch {
    return false
  }
}

const branchName = (vaultDir: string, date: string): string => {
  const stem = `app/ingest-${date}`
  if (!hasBranch(vaultDir, stem)) return stem
  for (let n = 2; ; n += 1) {
    const next = `${stem}-${n}`
    if (!hasBranch(vaultDir, next)) return next
  }
}

const today = (): string => {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const stagedCount = (vaultDir: string): number => {
  const out = git(vaultDir, ['diff', '--cached', '--name-only', '-z', '--', 'Clippings', 'raw'])
  return out.split('\0').filter((l) => l !== '').length
}

type Move = { rawName: string; clippingName: string }

const zeroSplit = (out: string): string[] => out.split('\0').filter((field) => field !== '')

/**
 * 커밋 전 작업이 남아 있는가 — 기본 브랜치로 옮겨 가면 딸려 가서 다음 자동 저장에 섞인다.
 * 대기함에 새로 넣은 자료(커밋 전 `Clippings/`)는 딸려 가도 되는 유일한 것이다.
 */
const hasLooseWork = (vaultDir: string): boolean =>
  zeroSplit(git(vaultDir, ['diff', '--name-only', '-z', '--no-renames', 'HEAD'])).length > 0 ||
  zeroSplit(
    git(vaultDir, [
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      'raw',
      'wiki',
      'outputs'
    ])
  ).length > 0

/**
 * 작업 브랜치를 버리고 자료를 대기함으로 돌려놓는다. 지우는 것은 브랜치 하나뿐이고, 원문을 전부 되살린 뒤에만 지운다.
 * 실패하면 작업 브랜치 위 그대로(false) — 원문이 든 커밋이 남고 승인에서 정리할 수 있다.
 */
const rollbackWorkBranch = (
  vaultDir: string,
  defaultBranch: string,
  branch: string,
  moves: Move[]
): boolean => {
  const written: string[] = []
  let left = false
  try {
    if (hasLooseWork(vaultDir)) {
      console.warn('skipped wikify rewind — uncommitted changes remain', branch)
      return false
    }
    // 시작 커밋 말고 다른 커밋(위키 페이지·앱 밖 도구의 커밋)이 있으면 브랜치를 지우지 않는다
    const commits = Number(git(vaultDir, ['rev-list', '--count', `${defaultBranch}..HEAD`]))
    if (commits > 1) {
      console.warn('skipped wikify rewind — commits beyond the start commit', branch, commits)
      return false
    }
    // 대기함 파일이 커밋 전이었으면 브랜치를 옮기는 순간 작업 폴더에서 사라진다 — 먼저 읽어 둔다
    const kept = moves.map((move) => ({
      name: move.clippingName,
      bytes: readFileSync(join(vaultDir, 'raw', move.rawName))
    }))
    git(vaultDir, ['checkout', '-q', defaultBranch])
    left = true
    const dir = join(vaultDir, 'Clippings')
    mkdirSync(dir, { recursive: true })
    for (const { name, bytes } of kept) {
      const dest = join(dir, name)
      // 추적 중이던 파일은 checkout 이 되살렸다. 그 사이 같은 이름으로 다른 자료가 들어왔으면 둘 다 남긴다
      if (existsSync(dest) && readFileSync(dest).equals(bytes)) continue
      const target = claimUniquePath(dir, name)
      writeFileSync(target, bytes)
      written.push(target)
    }
    git(vaultDir, ['branch', '-q', '-D', branch])
    return true
  } catch (error) {
    console.error('wikify rewind failed', branch, error)
    if (left) {
      // 반쯤 되살린 대기함으로 기본 브랜치에 서 있으면 승인도 다음 위키화도 원문을 못 찾는다 — 작업 브랜치로 돌아간다
      try {
        for (const path of written) rmSync(path, { force: true })
        git(vaultDir, ['checkout', '-q', branch])
      } catch (again) {
        console.error('wikify rewind return failed', branch, again)
      }
    }
    return false
  }
}

/** `preparePipeline` 이 한 일(작업 브랜치·이동·시작 커밋)을 되돌린다. 실패하면 false — 작업 브랜치가 남는다 */
export const rollbackPrepared = (vaultDir: string, prepared: Prepared): boolean =>
  rollbackWorkBranch(vaultDir, prepared.defaultBranch, prepared.branch, prepared.clippings)

const INTAKE = /^(Clippings|raw)\/[^/]+$/

/**
 * 위키화 도중 앱이 꺼져 남은 작업 브랜치를 되감는다. 대기함·원문 이동 말고는 아무것도 없는 브랜치만 —
 * 위키 페이지나 거절 정리가 있으면 사람이 승인에서 볼 것이라 건드리지 않는다.
 */
const rollbackStranded = (vaultDir: string): void => {
  const defaultBranch = defaultBranchOf(vaultDir)
  if (!defaultBranch) return
  const branch = git(vaultDir, ['branch', '--show-current']).trim()
  if (!isWorkBranch(branch)) return
  const fields = zeroSplit(
    git(vaultDir, ['diff', '--name-status', '-z', '-M', `${defaultBranch}...HEAD`])
  )
  const moves: Move[] = []
  for (let i = 0; i < fields.length;) {
    const status = fields[i]!
    const renamed = status.startsWith('R')
    const from = fields[i + 1]!
    const to = renamed ? fields[i + 2]! : from
    i += renamed ? 3 : 2
    if (!INTAKE.test(from) || !INTAKE.test(to)) return
    const rawName = to.slice('raw/'.length)
    if (renamed && from.startsWith('Clippings/') && to.startsWith('raw/')) {
      moves.push({ rawName, clippingName: from.slice('Clippings/'.length) })
    } else if (status === 'A' && to.startsWith('raw/')) {
      // 대기함 파일이 커밋 전이었다 — 원래 이름은 기록에 없어 정규화된 이름으로 돌아간다
      moves.push({ rawName, clippingName: rawName })
    } else if (!(status === 'D' && from.startsWith('Clippings/'))) {
      return
    }
  }
  rollbackWorkBranch(vaultDir, defaultBranch, branch, moves)
}

export const preparePipeline = (vaultDir: string, date: string = today()): Checked<Prepared> => {
  // 되감지 못해도 위키화 시작을 깨지 않는다 — 아래 사전 확인이 평소 문구로 막는다
  try {
    rollbackStranded(vaultDir)
  } catch (error) {
    console.error('stuck wikify rewind failed', error)
  }
  const base = prepareIngest(vaultDir)
  if (!base.ok) return base
  // 시작 전 미커밋 편집은 따로 저장한다 — 결과 커밋에 남의 수정이 딸려 들어가지 않게
  try {
    saveEdits(vaultDir)
  } catch {
    return {
      ok: false,
      reason: mainT().ingestMain.saveBeforeFailed
    }
  }

  const branch = branchName(vaultDir, date)
  git(vaultDir, ['checkout', '-q', '-b', branch])

  const taken = new Set(
    readdirSync(join(vaultDir, 'raw'))
      .filter((n) => n.endsWith('.md'))
      .map((n) => n.toLowerCase())
  )
  const { sources, shas: seenContent } = rawIndex(vaultDir)
  // 인용 역인덱스 — 첫 중복 때 한 번만 읽는다. 준비 루프 중 wiki/는 바뀌지 않는다(옮기는 건 Clippings/raw 뿐)
  let citeTexts: Array<{ rel: string; text: string }> | null = null
  const citeIndex = (): Array<{ rel: string; text: string }> => {
    if (citeTexts === null) {
      citeTexts = wikiFiles(vaultDir).flatMap((rel) => {
        try {
          return [{ rel, text: readFileSync(join(vaultDir, rel), 'utf8') }]
        } catch {
          return []
        }
      })
    }
    return citeTexts
  }
  const clippings: PreparedClipping[] = []
  // 옮기다 던지면(잠금·권한) 반쯤 옮긴 채 작업 브랜치에 남는다 — 되돌리고 기본 줄기로 돌아간다
  const moved: Array<{ name: string; rawName: string }> = []
  try {
    for (const name of pendingClippings(vaultDir)) {
      const full = join(vaultDir, 'Clippings', name)
      let text: string
      try {
        text = readFileSync(full, 'utf8')
      } catch {
        continue
      }
      const fm = frontmatterOf(text)
      const source = strOf(fm['source'])
      const rawName = normalizeRawName(name, taken)
      taken.add(rawName.toLowerCase())
      renameSync(full, join(vaultDir, 'raw', rawName))
      moved.push({ name, rawName })
      const duplicateOf = source ? sources.get(source) : undefined
      // 같은 내용이면 LLM 호출만 건너뛴다 — raw/ 이동·이력·-1 접미는 그대로
      const sha = sha256(text)
      const skipDraft = seenContent.has(sha)
      seenContent.add(sha)
      clippings.push({
        clippingName: name,
        rawName,
        title: strOf(fm['title']) ?? rawName.replace(/\.md$/i, ''),
        source,
        duplicateOf,
        updateTargets: duplicateOf ? citingNotes(citeIndex(), duplicateOf) : [],
        body: bodyOf(text),
        sha,
        skipDraft
      })
      // 같은 실행 안에서 겹친 URL 도 잡는다 — 먼저 옮긴 것이 정본이다
      if (source && !sources.has(source)) sources.set(source, rawName)
    }

    git(vaultDir, ['add', '-A', '--', 'Clippings', 'raw'])
    if (stagedCount(vaultDir) > 0) {
      git(vaultDir, ['commit', '-q', '-m', `chore: stage ${clippings.length} clippings for ingest`])
    }
  } catch (error) {
    console.error('wikify prepare move failed', error)
    for (const m of moved) {
      try {
        renameSync(join(vaultDir, 'raw', m.rawName), join(vaultDir, 'Clippings', m.name))
      } catch (moveBackError) {
        // 되돌리다 만 것은 다음 되감기가 맡는다 — 조용히 두지 않고 기록한다
        console.error('wikify prepare revert failed', m, moveBackError)
      }
    }
    // 원래 줄기로 돌아간다 — 못 돌아가도 자료는 대기함에 있다
    try {
      git(vaultDir, ['checkout', '-q', base.defaultBranch])
    } catch (checkoutError) {
      console.error('wikify prepare return failed', checkoutError)
    }
    return {
      ok: false,
      reason: mainT().ingestMain.prepareStopped
    }
  }
  return {
    ok: true,
    branch,
    defaultBranch: base.defaultBranch,
    head: base.head,
    authorSlug: authorOf(vaultDir),
    date,
    clippings
  }
}
