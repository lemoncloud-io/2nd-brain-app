// vault_volume.py 의 TypeScript 이식 — VAULT_MEMORY `- Volume to date:` 줄을 실행 기록의 fold 로 다시 계산한다.
// 원본: resources/vault-kit/projects/second-brain/config/scripts/vault_volume.py .
// 앱이 Python 없이 돌도록 옮겼다. 판정이 같다는 근거는 vault-verify.test.ts 가 원본과 나란히 돌려 대조한다.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const MEMORY_REL = 'wiki/VAULT_MEMORY.md'
const RUNS_DIR_REL = 'outputs/runs'
const TOPICS_DIR_REL = 'wiki/topics'
const LEDGER_REL = 'docs/vault-ingest-log.md'

const LEDGER_BULLET_RE = /^- Last Ingest:\s*(\d{4}-\d{2}-\d{2})/gm
const LEDGER_PROCESSED_RE = /processed\s+(\d+)\s+clipping/
const NO_DATE = '—'
const WIKI_NON_NOTES = new Set(['INDEX.md', 'VAULT_MEMORY.md', 'TOPIC_MAP.md'])
const VOLUME_RE =
  /^- Volume to date: (\d+) ingest runs \/ (\d+) clippings \((\S+) → (\S+)\) → wiki (\d+) notes.*토픽 (\d+) root \+ (\d+) sub/

export interface Volume {
  runs: number
  clippings: number
  first: string
  last: string
  notes: number
  root: number
  sub: number
}

/** Python str.splitlines — 줄 끝 문자 집합이 같고 마지막 빈 줄을 만들지 않는다 */
export const splitLines = (text: string): string[] => {
  // eslint-disable-next-line no-control-regex -- \x1c-\x1e(파일·그룹·레코드 구분자)도 Python 의 줄 끝이다
  const lines = text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile()
const isDir = (path: string): boolean => existsSync(path) && statSync(path).isDirectory()

// glob("*.md") — 점으로 시작하는 이름은 glob 이 건너뛴다. 이름순 정렬
const mdEntries = (dir: string): string[] =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.md') && !name.startsWith('.'))
    .sort()

// 원본은 text.split("---", 2)[1] — 첫 `---` 뒤부터 다음 `---` 앞까지
const frontmatter = (text: string): string => {
  if (!text.startsWith('---')) return ''
  const close = text.indexOf('---', 3)
  return close === -1 ? '' : text.slice(3, close)
}

type Fold = [runs: number, clippings: number, first: string | null, last: string | null]

const minMax = (dates: string[]): [string, string] => {
  const sorted = [...dates].sort()
  return [sorted[0]!, sorted[sorted.length - 1]!]
}

const foldLedger = (vault: string): Fold => {
  const ledger = join(vault, LEDGER_REL)
  if (!isFile(ledger)) return [0, 0, null, null]
  const text = readFileSync(ledger, 'utf8')
  const dates: string[] = []
  let clippings = 0
  for (const match of text.matchAll(LEDGER_BULLET_RE)) {
    dates.push(match[1]!)
    const start = match.index + match[0].length
    const end = text.indexOf('\n', start)
    const processed = LEDGER_PROCESSED_RE.exec(text.slice(start, end === -1 ? text.length : end))
    clippings += processed ? Number(processed[1]) : 0
  }
  if (dates.length === 0) return [0, 0, null, null]
  return [dates.length, clippings, ...minMax(dates)]
}

const foldRunlogs = (vault: string): Fold => {
  const dir = join(vault, RUNS_DIR_REL)
  if (!isDir(dir)) return [0, 0, null, null]
  let runs = 0
  let clippings = 0
  const dates: string[] = []
  for (const name of mdEntries(dir)) {
    const fm = frontmatter(readFileSync(join(dir, name), 'utf8'))
    const kind = /^kind:\s*(\S+)/m.exec(fm)
    if (!kind || kind[1] !== 'ingest') continue
    runs += 1
    const processed = /^processed:\s*(\d+)/m.exec(fm)
    clippings += processed ? Number(processed[1]) : 0
    const date = /^run_date:\s*"?([0-9-]{10})/m.exec(fm)
    if (date) dates.push(date[1]!)
  }
  if (dates.length === 0) return [runs, clippings, null, null]
  return [runs, clippings, ...minMax(dates)]
}

const countWikiNotes = (vault: string): number => {
  const dir = join(vault, 'wiki')
  return isDir(dir) ? mdEntries(dir).filter((name) => !WIKI_NON_NOTES.has(name)).length : 0
}

const countTopics = (vault: string): [root: number, sub: number] => {
  const dir = join(vault, TOPICS_DIR_REL)
  if (!isDir(dir)) return [0, 0]
  let root = 0
  let sub = 0
  for (const name of mdEntries(dir)) {
    const fm = frontmatter(readFileSync(join(dir, name), 'utf8'))
    // 원본 정규식 그대로 — `up:` 값이 비면 \s* 가 줄바꿈을 넘어 다음 줄을 값으로 읽는다
    const up = /^up:\s*(.*)$/m.exec(fm)
    if (up && up[1]!.trim().replace(/^"+|"+$/g, '')) sub += 1
    else root += 1
  }
  return [root, sub]
}

export const computeVolume = (vault: string): Volume => {
  const [ledRuns, ledClippings, ledFirst, ledLast] = foldLedger(vault)
  const [logRuns, logClippings, logFirst, logLast] = foldRunlogs(vault)
  const [root, sub] = countTopics(vault)
  return {
    runs: ledRuns + logRuns,
    clippings: ledClippings + logClippings,
    first: ledFirst ?? logFirst ?? NO_DATE,
    last: logLast ?? ledLast ?? NO_DATE,
    notes: countWikiNotes(vault),
    root,
    sub
  }
}

// ui-hangul-ignore: 볼트 VAULT_MEMORY 본문 한 줄 — Python 원본과 같은 글자(볼트 데이터, D8)
export const formatVolumeLine = (vol: Volume, asof: string): string =>
  `- Volume to date: ${vol.runs} ingest runs / ${vol.clippings} clippings ` +
  `(${vol.first} → ${vol.last}) → wiki ${vol.notes} notes(실측 ${asof}), ` +
  `토픽 ${vol.root} root + ${vol.sub} sub — fold 파생값, 수동 편집 금지 ` +
  `(vault_volume.py --write)`

const storedLine = (vault: string): [lineno: number, line: string] | null => {
  const memory = join(vault, MEMORY_REL)
  if (!isFile(memory)) return null
  const lines = splitLines(readFileSync(memory, 'utf8'))
  const index = lines.findIndex((line) => line.startsWith('- Volume to date:'))
  return index === -1 ? null : [index + 1, lines[index]!]
}

/** 저장된 볼륨 줄이 fold 와 다르면 defect 문구. 줄이 없으면(2026-09-03 이후 볼트) 빈 배열 */
export const checkVolume = (vault: string): string[] => {
  const found = storedLine(vault)
  if (found === null) return []
  const vol = computeVolume(vault)
  const [lineno, line] = found
  const match = VOLUME_RE.exec(line)
  if (!match) {
    return [
      `${MEMORY_REL}:${lineno} Volume line does not parse; expected: ${formatVolumeLine(vol, '<date>')}`
    ]
  }
  const got: Volume = {
    runs: Number(match[1]),
    clippings: Number(match[2]),
    first: match[3]!,
    last: match[4]!,
    notes: Number(match[5]),
    root: Number(match[6]),
    sub: Number(match[7])
  }
  const keys = ['runs', 'clippings', 'first', 'last', 'notes', 'root', 'sub'] as const
  const diffs = keys
    .filter((key) => got[key] !== vol[key])
    .map((key) => `${key}=${got[key]} (ledger fold: ${vol[key]})`)
  if (diffs.length === 0) return []
  return [
    `${MEMORY_REL}:${lineno} Volume line drifted from the ledger fold — ${diffs.join(', ')}; run vault_volume.py --write`
  ]
}

const today = (): string => {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** `--write` — 저장된 줄이 있을 때만 제자리에서 바꾼다. 없으면 아무것도 쓰지 않는다 */
export const writeVolumeLine = (vault: string): void => {
  const memory = join(vault, MEMORY_REL)
  if (!isFile(memory)) return
  const lines = splitLines(readFileSync(memory, 'utf8'))
  const index = lines.findIndex((line) => line.startsWith('- Volume to date:'))
  if (index === -1) return
  lines[index] = formatVolumeLine(computeVolume(vault), today())
  writeFileSync(memory, `${lines.join('\n')}\n`)
}
