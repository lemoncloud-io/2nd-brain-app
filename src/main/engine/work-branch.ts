// 위키화 전후 볼트 git 확인 — app 레인은 에이전트가 작업 브랜치를 만들고 커밋까지만 한다
// (vault-ingest-agent.md § App 레인). 앱은 실행 전 상태를 고정하고 실행 후 계약을 확인한다.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { git as run } from '../git'
import { mainT } from '../i18n'

const WORK_BRANCH = /^app\/ingest-\d{4}-\d{2}-\d{2}(-\d+)?$/
const DEFAULT_BRANCHES = ['main', 'master']

export type IngestBase = { defaultBranch: string; head: string }
export type Checked<T> = ({ ok: true } & T) | { ok: false; reason: string }

const git = (dir: string, args: string[]): string => run(dir, args).trim()

// `rev-parse --verify --quiet` 는 브랜치가 없을 때만 exit 1 이다 — 그 밖(저장소 아님·git 없음)은 원인 그대로 던진다
const hasBranch = (dir: string, name: string): boolean => {
  try {
    git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`])
    return true
  } catch (error) {
    if ((error as { status?: number }).status === 1) return false
    throw error
  }
}

export const isWorkBranch = (name: string): boolean => WORK_BRANCH.test(name)

/**
 * 기본 브랜치가 아닌 곳에 있을 때 사용자 말 — 앱 작업 브랜치면 승인 대기, 아니면 팀이 확인 중인 작업(PR) 위다.
 * action = "위키화해 주세요" 같은 할 일 권유
 */
export const notOnDefaultReason = (current: string, action: string): string =>
  isWorkBranch(current)
    ? mainT().mainErrors.draftPending(action)
    : mainT().mainErrors.teamPending(action)

/** 앱이 사람 대신 남긴 커밋 — 편집 저장(`edit:`)·받기 전 자동 저장(`save:`)·대화가 쓴 노트(`note:`) */
const APP_COMMIT = /^(edit|save|note): /

/**
 * `branch` 에만 있고 `target` 에 아직 없는 커밋(오래된 것부터, 병합 커밋 제외)을 가른다.
 * carry = 앱이 남긴 커밋 — 기본 줄기로 돌아갈 때 챙겨 간다. foreign = 다른 도구(CLI 등)가 만든 커밋.
 * 같은 변경이 다른 해시로 들어간 커밋(cherry-pick·rebase)은 빠진다.
 */
export const strandedCommits = (
  vaultDir: string,
  branch: string,
  target: string
): { carry: string[]; foreign: string[] } => {
  const rows = git(vaultDir, [
    'log',
    '--cherry-pick',
    '--right-only',
    '--no-merges',
    '--reverse',
    '--format=%H%x09%s',
    `${target}...${branch}`
  ])
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const tab = line.indexOf('\t')
      return { hash: line.slice(0, tab), subject: line.slice(tab + 1) }
    })
  return {
    carry: rows.filter((row) => APP_COMMIT.test(row.subject)).map((row) => row.hash),
    foreign: rows.filter((row) => !APP_COMMIT.test(row.subject)).map((row) => row.hash)
  }
}

/**
 * 다른 도구가 만든 작업이 팀에 들어갔나 — 앱이 그 위에 자동 저장한 커밋은 따지지 않는다(챙겨 가면 된다).
 * 앱 커밋 때문에 `landedIn` 이 영영 거짓이 되어 어제 브랜치에 갇히던 것을 막는다.
 */
export const foreignLanded = (vaultDir: string, foreign: string[], target: string): boolean =>
  foreign.length === 0 || landedIn(vaultDir, foreign[foreign.length - 1], target)

/**
 * `branch` 의 작업이 이미 `target`(대개 `origin/main`)에 들어갔나. 팀은 PR 을 squash 로도 머지한다 —
 * 같은 내용이 다른 커밋으로 돌아오므로 커밋이 아니라 내용을 본다.
 * ① 자기 커밋이 없으면 들어간 것 ② 그 브랜치가 건드린 경로가 `target` 과 같으면 들어간 것(삭제도 경로로 잡힌다)
 * ③ 커밋이 그대로 들어간 뒤 팀이 같은 파일을 더 고친 경우는 `git cherry` 의 patch-id(`-` = 같은 변경이 있다)가 잡는다.
 */
export const landedIn = (vaultDir: string, branch: string, target: string): boolean => {
  let base: string
  try {
    base = git(vaultDir, ['merge-base', target, branch])
  } catch (error) {
    // exit 1 = 공통 조상이 없다(다른 기록). 그 밖(손상·권한)은 원인 그대로 던진다
    if ((error as { status?: number }).status === 1) return false
    throw error
  }
  if (git(vaultDir, ['rev-list', '--count', `${base}..${branch}`]) === '0') return true
  // -z: 한글 파일명이 따옴표·8진수로 바뀌지 않게
  const touched = git(vaultDir, ['diff', '-z', '--name-only', '--no-renames', base, branch])
    .split('\0')
    .filter((line) => line !== '')
  if (touched.length === 0) return true
  try {
    git(vaultDir, ['--literal-pathspecs', 'diff', '--quiet', target, branch, '--', ...touched])
    return true
  } catch (error) {
    if ((error as { status?: number }).status !== 1) throw error
  }
  const marks = git(vaultDir, ['cherry', target, branch])
    .split('\n')
    .filter((line) => line !== '')
  return marks.length > 0 && marks.every((line) => line.startsWith('-'))
}

export const defaultBranchOf = (vaultDir: string): string | null =>
  DEFAULT_BRANCHES.find((name) => hasBranch(vaultDir, name)) ?? null

// .gitkeep·.DS_Store 같은 숨김 파일은 처리 대상이 아니다
export const pendingClippings = (vaultDir: string): string[] =>
  readdirSync(join(vaultDir, 'Clippings')).filter((name) => !name.startsWith('.'))

export const prepareIngest = (vaultDir: string): Checked<IngestBase> => {
  const defaultBranch = defaultBranchOf(vaultDir)
  if (!defaultBranch) return { ok: false, reason: mainT().mainErrors.noDefaultBranch }
  const current = git(vaultDir, ['branch', '--show-current'])
  if (current !== defaultBranch) {
    return { ok: false, reason: notOnDefaultReason(current, mainT().mainErrors.thenDraft) }
  }
  if (pendingClippings(vaultDir).length === 0) {
    return {
      ok: false,
      reason: mainT().engineMain.draft.nothingQueued
    }
  }
  return { ok: true, defaultBranch, head: git(vaultDir, ['rev-parse', defaultBranch]) }
}

export const checkIngestResult = (
  vaultDir: string,
  base: IngestBase
): Checked<{ branch: string }> => {
  if (git(vaultDir, ['rev-parse', base.defaultBranch]) !== base.head) {
    return {
      ok: false,
      reason: mainT().engineMain.draft.wikiMoved(base.defaultBranch)
    }
  }
  const branch = git(vaultDir, ['branch', '--show-current'])
  if (!isWorkBranch(branch)) {
    return {
      ok: false,
      reason: mainT().engineMain.draft.notCollected
    }
  }
  if (Number(git(vaultDir, ['rev-list', '--count', `${base.head}..${branch}`])) < 1) {
    return {
      ok: false,
      reason: mainT().engineMain.draft.noPages
    }
  }
  const left = pendingClippings(vaultDir)
  if (left.length > 0) {
    return {
      ok: false,
      reason: mainT().engineMain.draft.leftover(left.join(', '))
    }
  }
  return { ok: true, branch }
}
