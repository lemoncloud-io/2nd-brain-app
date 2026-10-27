// 문서 기록 — 한 문서의 버전 목록과 그때 글. 리더 "…" → 기록 이 쓴다.
// 이름이 바뀐 문서도 바뀌기 전까지 따라간다(`--follow`). 누가 썼는지는 커밋에서 가른다:
// 위키화 작업 브랜치에서 온 커밋, 채팅이 쓴 노트(`note:`), 에이전트 결과 커밋(`feat:`)은 AI, 로그인한 내 GitHub noreply 주소는 나,
// 앱 이름(로그인 전 커밋)은 누군지 모르는 고침, 그 밖은 그 사람 이름이다.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  DOC_HISTORY_LIMIT,
  type DocHistory,
  type DocVersion,
  type DocVersionKind
} from '../../shared/ipc-contract'
import { defaultBranchOf, isWorkBranch } from '../engine/work-branch'
import { git } from '../git'
import { APP_EMAIL, APP_NAME, PAST_APP_NAMES, appUserEmail } from './app-identity'
import { ignoredByGit, isHistoryFile } from './vault-scope'

const FIELD = '\x1f'
const REV = /^[0-9a-f]{40}$/
/** 승인 화면이 위키화 작업 브랜치를 합칠 때 남기는 제목(`review-service.ts`) */
const INGEST_MERGE = '^merge: app/ingest-'

type Row = DocVersion & { path: string; subject: string }

const rowsOf = (vaultDir: string, rel: string): Row[] => {
  if (!existsSync(join(vaultDir, '.git'))) return []
  // -z: 레코드는 `머리\0\n경로\0` — 경로는 그 커밋에서의 이름(이름이 바뀌기 전 버전은 옛 이름)
  const out = git(vaultDir, [
    'log',
    '--follow',
    // 하나 더 읽어 넘었는지 안다
    `-n${DOC_HISTORY_LIMIT + 1}`,
    '--name-only',
    '-z',
    `--format=%H${FIELD}%an${FIELD}%ae${FIELD}%aI${FIELD}%s`,
    '--',
    `:(literal)${rel}`
  ])
  const rows: Row[] = []
  for (const token of out.split('\0')) {
    if (token.startsWith('\n')) {
      const last = rows.at(-1)
      if (last) last.path = token.slice(1)
      continue
    }
    if (token === '') continue
    const [rev = '', author = '', email = '', date = '', ...subject] = token.split(FIELD)
    rows.push({
      rev,
      kind: kindOf(author, email),
      author,
      date,
      path: rel,
      subject: subject.join(FIELD)
    })
  }
  return rows
}

const kindOf = (author: string, email: string): DocVersionKind => {
  const mine = appUserEmail()
  if (mine !== null && email === mine) return 'me'
  if ((author === APP_NAME || PAST_APP_NAMES.includes(author)) && email === APP_EMAIL) return 'app'
  return 'person'
}

/**
 * 합친 위키화 하나가 들여온 커밋 — 머지 커밋 sha 로 기억한다. 머지가 들여온 것은 바뀌지 않으므로
 * 저장할 때마다 목록을 다시 받아도 git 은 새 머지에만 한 번 더 돈다
 */
const MERGED_INGEST_MAX = 500
const mergedIngest = new Map<string, string[]>()

const revList = (vaultDir: string, range: string): string[] =>
  git(vaultDir, ['rev-list', '--no-merges', range])
    .split('\n')
    .filter((rev) => rev !== '')

/** 위키화 작업 브랜치에서 온 커밋 — 합친 것과, 지금 서 있는 아직 승인 안 된 작업 브랜치의 것 */
const ingestCommits = (vaultDir: string, since: string): Set<string> => {
  const found = new Set<string>()
  const merges = git(vaultDir, [
    'log',
    '--merges',
    '-E',
    `--grep=${INGEST_MERGE}`,
    `--since=${since}`,
    '--format=%H %P'
  ])
  for (const line of merges.split('\n')) {
    const [merge, first, second] = line.trim().split(' ')
    if (!merge || !first || !second) continue
    let brought = mergedIngest.get(merge)
    if (brought === undefined) {
      brought = revList(vaultDir, `${first}..${second}`)
      if (mergedIngest.size >= MERGED_INGEST_MAX) {
        const oldest = mergedIngest.keys().next()
        if (!oldest.done) mergedIngest.delete(oldest.value)
      }
      mergedIngest.set(merge, brought)
    }
    for (const rev of brought) found.add(rev)
  }
  const current = git(vaultDir, ['branch', '--show-current']).trim()
  const base = defaultBranchOf(vaultDir)
  if (isWorkBranch(current) && base !== null) {
    for (const rev of revList(vaultDir, `${base}..HEAD`)) found.add(rev)
  }
  return found
}

/** 커밋 제목으로 아는 AI 커밋 — 채팅이 쓴 노트(`note:`)와 위키화 에이전트의 결과 커밋(`feat:`, vault-ingest-agent) */
const AI_SUBJECT = /^(note|feat)(\([^)]*\))?: /

/**
 * 새것부터 버전 목록. recorded=false 는 기록을 남기지 않는 문서다(git 없는 보관함·git 이 무시하는 파일) —
 * 저장해도 기록이 생기지 않으므로 "아직 없음" 과 가른다. 누가 썼는지 가르는 데 실패해도 목록은 준다:
 * 제목으로 아는 AI 커밋만 AI 로 두고 labelsPartial 로 알린다(조용히 사람으로 단정하지 않는다)
 */
export const docHistory = (vaultDir: string, rel: string): DocHistory => {
  if (!existsSync(join(vaultDir, '.git')) || ignoredByGit(vaultDir, rel)) {
    return { versions: [], recorded: false, truncated: false, labelsPartial: false }
  }
  const all = rowsOf(vaultDir, rel)
  const rows = all.slice(0, DOC_HISTORY_LIMIT)
  const oldest = rows.at(-1)
  let ingest = new Set<string>()
  let labelsPartial = false
  if (oldest !== undefined) {
    try {
      ingest = ingestCommits(vaultDir, oldest.date)
    } catch (error) {
      console.warn('could not classify wikify commits — falling back to subjects', rel, error)
      labelsPartial = true
    }
  }
  return {
    versions: rows.map(({ rev, kind, author, date, subject }) => ({
      rev,
      kind: ingest.has(rev) || AI_SUBJECT.test(subject) ? 'ai' : kind,
      author,
      date
    })),
    recorded: true,
    truncated: all.length > DOC_HISTORY_LIMIT,
    labelsPartial
  }
}

/**
 * 그 버전의 글 — `rev` 는 화면에서 온다. 이 문서의 기록에 있는 커밋만 받고, 경로는 그 커밋에서의
 * 이름을 기록에서 찾는다(화면이 준 경로로 `git show` 하지 않는다). 없으면 null.
 * 그때 이름이 기록을 내주지 않는 자리(숨김 폴더 등)였으면 그 버전은 주지 않는다 — 이름을 옮겨 왔다고 열리지 않는다
 */
export const docAt = (vaultDir: string, rel: string, rev: string): string | null => {
  if (!REV.test(rev)) return null
  const row = rowsOf(vaultDir, rel).find((r) => r.rev === rev)
  if (row === undefined || !isHistoryFile(row.path)) return null
  return git(vaultDir, ['show', `${rev}:${row.path}`])
}
