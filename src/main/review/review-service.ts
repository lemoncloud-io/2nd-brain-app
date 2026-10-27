// 페이지 단위 승인·거절의 결정론 처리 — 에이전트를 다시 부르지 않는다
// (vault-ingest-agent.md § 페이지 거절 정리). 검증을 통과해야만 기본 브랜치에 병합한다.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import type {
  FinalizeOutcome,
  UndoMergeOutcome,
  ReviewChange,
  ReviewListing,
  ReviewPage
} from '../../shared/ipc-contract'
import { defaultBranchOf, isWorkBranch } from '../engine/work-branch'
import { git } from '../git'
import type { Checked } from '../engine/work-branch'
import { verifyVault, type VerifyOutcome } from '../verify/vault-verify'
import { writeVolumeLine } from '../verify/vault-volume'
import { saveEdits } from '../vault/sync-service'
import { LINT_EXEMPT } from '../../shared/wiki/lint'
import { mainT } from '../i18n'

const LINK_FILES = ['wiki/INDEX.md', 'wiki/TOPIC_MAP.md']
// 승인 목록에 안 보이는 구조 페이지 — 정본은 lint 의 LINT_EXEMPT 다.
// LINK_FILES 와는 다르다: 그쪽은 합칠 때 링크를 고쳐 쓰는 파일(INDEX·TOPIC_MAP만)이다
const NON_PAGES = new Set<string>(LINT_EXEMPT)
const TOPICS_DIR = 'wiki/topics/'
const RUNS_DIR = 'outputs/runs/'
const APPEND_ONLY_DIRS = ['raw/', 'archive/']
const DROPPED_HEADING = '## Dropped / Issues'

type Verify = (vaultDir: string, base: string) => Promise<VerifyOutcome>

// 볼트 기록(git) 조작이 예외로 끝났다 — 무엇을 안 했는지 먼저, 원문은 괄호 끝에(알릴 때 복사하게)
const gitFailure = (what: string, error: unknown): string =>
  mainT().reviewMain.gitFailure(what, errorMessage(error))

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

// -z 출력이라 한글·공백 파일명이 따옴표로 감싸이지 않는다. R/C 는 원래 경로·새 경로 순서다.
const parseNameStatus = (output: string): ReviewChange[] => {
  const fields = output.split('\0')
  const changes: ReviewChange[] = []
  for (let i = 0; i < fields.length - 1;) {
    const status = fields[i].charAt(0)
    if (status === 'R' || status === 'C') {
      changes.push({ status, from: fields[i + 1], path: fields[i + 2] })
      i += 3
    } else {
      changes.push({ status, path: fields[i + 1] })
      i += 2
    }
  }
  return changes
}

const isPage = (path: string): boolean =>
  path.startsWith('wiki/') &&
  path.endsWith('.md') &&
  !NON_PAGES.has(path) &&
  !path.startsWith(TOPICS_DIR)

const inAppendOnly = (path?: string): boolean =>
  path !== undefined && APPEND_ONLY_DIRS.some((dir) => path.startsWith(dir))

/** idle = 위키화 결과가 없다(작업 브랜치가 아니다). 오류가 아니라 빈 상태다 */
export const listPages = (
  vaultDir: string
): Checked<ReviewListing> | { ok: false; reason: string; idle: true } => {
  const defaultBranch = defaultBranchOf(vaultDir)
  if (!defaultBranch) return { ok: false, reason: mainT().mainErrors.noDefaultBranch }
  const branch = git(vaultDir, ['branch', '--show-current']).trim()
  if (!isWorkBranch(branch)) {
    return {
      ok: false,
      reason: mainT().reviewMain.nothingToApprove,
      idle: true
    }
  }

  const pages: ReviewPage[] = []
  const others: ReviewChange[] = []
  const diff = git(vaultDir, ['diff', '--name-status', '-z', `${defaultBranch}...HEAD`])
  for (const change of parseNameStatus(diff)) {
    const status = change.status === 'A' ? 'added' : change.status === 'M' ? 'modified' : null
    if (status && isPage(change.path)) {
      pages.push({ path: change.path, slug: posix.basename(change.path, '.md'), status })
    } else {
      others.push(change)
    }
  }
  pages.sort((a, b) => a.path.localeCompare(b.path))
  return { ok: true, branch, defaultBranch, pages, others }
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// [[slug]]·[[wiki/slug]]·[[dir/slug]] + #heading·|alias(표 안의 \| 포함). [[slugger]] 같은 다른 이름은 제외.
const linkPattern = (page: ReviewPage): RegExp => {
  const rel = page.path.slice('wiki/'.length, -'.md'.length)
  const names = [...new Set([page.slug, rel, `wiki/${rel}`])].map(escapeRegExp).join('|')
  return new RegExp(`\\[\\[(?:${names})(?:#[^\\]|]*)?(?:\\\\?\\|[^\\]]*)?\\]\\]`)
}

const linkFiles = (vaultDir: string): string[] => {
  const topics = join(vaultDir, TOPICS_DIR)
  const topicFiles = existsSync(topics)
    ? readdirSync(topics)
        .filter((name) => name.endsWith('.md'))
        .map((name) => `${TOPICS_DIR}${name}`)
    : []
  return [...LINK_FILES, ...topicFiles].filter((rel) => existsSync(join(vaultDir, rel)))
}

const linesOnBranch = (vaultDir: string, branch: string, rel: string): Set<string> => {
  try {
    return new Set(git(vaultDir, ['show', `${branch}:${rel}`]).split('\n'))
  } catch {
    return new Set() // 기본 브랜치에 없는 파일(이번 실행이 만든 topic 등)
  }
}

// 이번 실행이 추가한 링크 줄만 지운다 — 기본 브랜치에 원래 있던 줄(수정 페이지의 기존 INDEX 항목 등)은 남긴다.
const removeLinkLines = (vaultDir: string, defaultBranch: string, rejected: ReviewPage[]): void => {
  const patterns = rejected.map(linkPattern)
  for (const rel of linkFiles(vaultDir)) {
    const file = join(vaultDir, rel)
    const lines = readFileSync(file, 'utf8').split('\n')
    const original = linesOnBranch(vaultDir, defaultBranch, rel)
    const kept = lines.filter(
      (line) => original.has(line) || !patterns.some((pattern) => pattern.test(line))
    )
    if (kept.length !== lines.length) writeFileSync(file, kept.join('\n'))
  }
}

const runLogOf = (vaultDir: string, changes: ReviewChange[]): string | null =>
  changes.find(
    (change) =>
      (change.status === 'A' || change.status === 'M') &&
      change.path.startsWith(RUNS_DIR) &&
      change.path.endsWith('.md') &&
      /^kind:\s*ingest\s*$/m.test(readFileSync(join(vaultDir, change.path), 'utf8'))
  )?.path ?? null

// run-log § Dropped / Issues 끝에 `- 거절됨: <slug>` 를 붙인다. 절이 없으면 만든다.
const noteRejections = (vaultDir: string, runLog: string, rejected: ReviewPage[]): void => {
  const file = join(vaultDir, runLog)
  const text = readFileSync(file, 'utf8')
  // ui-hangul-ignore: 볼트 run-log 본문(D8) — 화면 문구가 아니다
  const lines = rejected.map((page) => `- 거절됨: ${page.slug}`).join('\n')
  const start = text.indexOf(DROPPED_HEADING)
  if (start === -1) {
    writeFileSync(file, `${text.trimEnd()}\n\n${DROPPED_HEADING}\n\n${lines}\n`)
    return
  }
  const next = text.indexOf('\n## ', start + DROPPED_HEADING.length)
  const end = next === -1 ? text.length : next
  writeFileSync(file, `${text.slice(0, end).trimEnd()}\n${lines}\n${text.slice(end)}`)
}

// 이전 확정이 정리 커밋까지 하고 검증에서 멈췄으면 그 페이지는 이미 diff 에서 빠져 있다 — 다시 거절해도 할 일이 없다
const alreadyCleaned = (vaultDir: string, defaultBranch: string, path: string): boolean =>
  isPage(path) &&
  git(vaultDir, ['diff', '--name-only', `${defaultBranch}...HEAD`, '--', path]).trim() === ''

const verifyBundled: Verify = (vaultDir, base) => Promise.resolve(verifyVault({ vaultDir, base }))

const MEMORY_FILE = 'wiki/VAULT_MEMORY.md'

// 옛 볼트는 VAULT_MEMORY 에 볼륨 줄을 적어 두고, vault_verify 는 그 줄이 실행 기록의 파생값과 같기를 요구한다.
// 거절로 노트 수가 바뀌어도 맞도록 검증 직전에 다시 계산한다.
const refreshVolumeLine = (vaultDir: string): void => {
  writeVolumeLine(vaultDir)
  if (git(vaultDir, ['status', '--porcelain', '--', MEMORY_FILE]).trim() !== '') {
    git(vaultDir, ['add', '--', MEMORY_FILE])
    git(vaultDir, ['commit', '-q', '-m', 'chore: refresh vault volume line'])
  }
}

export const finalize = async (
  vaultDir: string,
  rejectedPaths: string[],
  verify: Verify = verifyBundled
): Promise<FinalizeOutcome> => {
  const listing = listPages(vaultDir)
  if (!listing.ok) return { status: 'failed', reason: listing.reason }
  const { branch, defaultBranch, pages, others } = listing

  // raw/·archive/ 에서 나가거나 거기 있던 파일을 고친 변경만 막는다. 밖에서 들어온 이동·복사
  // (위키화가 커밋된 Clippings/ 원문을 raw/ 로 옮기면 git 은 R 로 본다)는 추가다
  const appendOnlyEdits = others.filter(
    (change) =>
      inAppendOnly(change.from) ||
      (inAppendOnly(change.path) && !['A', 'R', 'C'].includes(change.status))
  )
  if (appendOnlyEdits.length > 0) {
    const listed = appendOnlyEdits
      .map((change) => `${change.status} ${change.from ? `${change.from} → ` : ''}${change.path}`)
      .join(', ')
    return {
      status: 'failed',
      reason: mainT().reviewMain.rawChanged(listed)
    }
  }
  const unknown = rejectedPaths.filter(
    (path) =>
      !pages.some((page) => page.path === path) && !alreadyCleaned(vaultDir, defaultBranch, path)
  )
  if (unknown.length > 0) {
    return {
      status: 'failed',
      reason: mainT().reviewMain.unknownReject(unknown.join(', '))
    }
  }

  const rejected = pages.filter((page) => rejectedPaths.includes(page.path))
  try {
    if (rejected.length > 0) {
      for (const page of rejected) {
        if (page.status === 'added') git(vaultDir, ['rm', '-q', '--', page.path])
        else git(vaultDir, ['checkout', defaultBranch, '--', page.path])
      }
      removeLinkLines(vaultDir, defaultBranch, rejected)
      const runLog = runLogOf(vaultDir, others)
      if (runLog) noteRejections(vaultDir, runLog, rejected)
      git(vaultDir, ['add', '-A', '--', 'wiki', 'outputs'])
      git(vaultDir, ['commit', '-q', '-m', `chore: reject ${rejected.length} wiki page(s)`])
    }

    refreshVolumeLine(vaultDir)

    const base = git(vaultDir, ['merge-base', 'HEAD', defaultBranch]).trim()
    const result = await verify(vaultDir, base)
    if (result.status === 'unavailable') return { status: 'failed', reason: result.reason }
    if (result.status === 'fail') return { status: 'verify-failed', defects: result.defects }

    // 승인을 기다리는 사이 앱 밖(Obsidian)에서 고친 문서 — 그대로 두면 기본 줄기로 옮기지 못해 확정이 영영 막힌다.
    // 검증은 작업 폴더 그대로를 봤으므로 이 편집도 거쳤다(원본 raw/ 를 고쳤으면 검증이 막는다). 작업 브랜치에 저장해 함께 병합한다
    saveEdits(vaultDir)
    git(vaultDir, ['checkout', '-q', defaultBranch])
    git(vaultDir, ['merge', '--no-ff', '-q', '-m', `merge: ${branch}`, branch])
    // 팀에 보내는 일은 여기서 하지 않는다 — 내 위키의 승인은 네트워크와 무관하게 끝난다(review-handlers)
    return {
      status: 'merged',
      branch,
      rejected: rejected.map((page) => page.slug),
      teamReview: null,
      shareError: null,
      published: null,
      publishError: null
    }
  } catch (error) {
    return { status: 'failed', reason: gitFailure(mainT().reviewMain.applyFailed, error) }
  }
}

/**
 * 방금 한 확정 병합을 되돌린다 — 작업 브랜치로 돌아가고 기본 브랜치를 병합 직전 커밋에 둔다.
 * 거절 정리 커밋은 작업 브랜치에 남으므로 승인 화면은 확정 직전 선택 그대로 다시 열린다.
 * 기본 브랜치의 마지막 커밋이 이 브랜치 병합이 아니거나(병합 뒤 편집·위키화가 있었다)
 * 커밋 안 한 변경이 있으면 아무것도 바꾸지 않는다. reset 없이 브랜치 포인터만 옮긴다.
 */
export const undoMerge = (vaultDir: string, branch: string): UndoMergeOutcome => {
  if (!isWorkBranch(branch)) return { status: 'failed', reason: mainT().reviewMain.notDraft }
  const defaultBranch = defaultBranchOf(vaultDir)
  if (!defaultBranch) return { status: 'failed', reason: mainT().mainErrors.noDefaultBranch }
  const read = (args: string[]): string => git(vaultDir, args).trim()
  try {
    if (read(['branch', '--show-current']) !== defaultBranch) {
      return {
        status: 'failed',
        reason: mainT().reviewMain.noDraftToUndo
      }
    }
    const [, before, merged] = read(['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ')
    const lastIsThisMerge =
      read(['log', '-1', '--format=%s']) === `merge: ${branch}` &&
      merged !== undefined &&
      read(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]) === merged
    if (!lastIsThisMerge) {
      return {
        status: 'failed',
        reason: mainT().reviewMain.undoMoved
      }
    }
    if (read(['status', '--porcelain', '--untracked-files=no']) !== '') {
      return { status: 'failed', reason: mainT().reviewMain.unsavedVault }
    }
    // 이미 팀에 올라간 병합을 로컬에서만 되돌리면 다음 올리기가 거절된다.
    // 같은 커밋인지가 아니라 **포함되는지**를 본다 — 내 병합 뒤에 동료가 더 올렸으면 같지 않지만 이미 남에게 갔다
    const pushed = `refs/remotes/origin/${defaultBranch}`
    if (read(['for-each-ref', '--format=%(refname)', pushed]) !== '') {
      const contained = (() => {
        try {
          git(vaultDir, ['merge-base', '--is-ancestor', 'HEAD', pushed])
          return true
        } catch {
          return false
        }
      })()
      if (contained) {
        return { status: 'failed', reason: mainT().reviewMain.undoPushed }
      }
    }
    git(vaultDir, ['checkout', '-q', branch])
    git(vaultDir, ['branch', '-f', defaultBranch, before])
    return { status: 'undone', branch }
  } catch (error) {
    return { status: 'failed', reason: gitFailure(mainT().reviewMain.unapplyFailed, error) }
  }
}
