// 내 수정을 팀 확인 요청으로 — 기본 줄기에 쌓인 안 올린 작업을 작업 이름 하나로 올리고 PR 을 연다.
// 열어 둔 요청이 아직 열려 있으면 새로 열지 않고 같은 이름으로 다시 올려 거기에 더한다. 머지는 사람이 웹에서 한다.
// 연 요청은 보관함 안(.git 아래, 커밋되지 않는 곳)에 기억해 둔다 — 앱을 다시 켜도 "팀 확인 중" 이 남는다.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { git, spawnGit } from '../git'
import { defaultBranchOf, landedIn } from '../engine/work-branch'
import { readRemote } from '../vault/remote-service'
import { writeJsonAtomic } from '../vault/atomic-write'
import { listTeamReviews } from './team-share'
import type { PushResult } from '../../shared/ipc-contract'
import { mainT } from '../i18n'

/** 열어 둔 요청 — `branch` 는 팀 저장소 쪽 이름이다(이 보관함에는 그 이름의 브랜치가 없다) */
export type EditShare = { branch: string; number: number; url: string }

export type EditShareResult =
  { ok: true; share: EditShare; added: boolean } | { ok: false; reason: string }

export type EditShareDeps = {
  /** 팀 저장소가 로그인 없이 보이는가 — 모르면 undefined(막지 않는다) */
  isPublic(webUrl: string): Promise<boolean | undefined>
  push(vaultDir: string, local: string, remote: string): Promise<PushResult>
  openPullRequest(input: {
    url: string
    branch: string
    base: string
    title: string
    body: string
  }): Promise<{ ok: true; number: number; url: string } | { ok: false; reason: string }>
  /** 그 요청이 아직 열려 있나 — 물어보지 못했으면 null */
  isOpen(url: string, number: number): Promise<boolean | null>
  now(): Date
}

const store = (vaultDir: string): string => join(vaultDir, '.git', '2nd-brain-edit-share.json')

export const readEditShare = (vaultDir: string): EditShare | null => {
  const file = store(vaultDir)
  if (!existsSync(file)) return null
  try {
    const v = JSON.parse(readFileSync(file, 'utf8')) as Partial<EditShare>
    return typeof v.branch === 'string' && typeof v.number === 'number' && typeof v.url === 'string'
      ? { branch: v.branch, number: v.number, url: v.url }
      : null
  } catch {
    return null
  }
}

const forget = (vaultDir: string): void => rmSync(store(vaultDir), { force: true })

const hasRef = (vaultDir: string, ref: string): boolean => {
  try {
    git(vaultDir, ['rev-parse', '--verify', '--quiet', ref])
    return true
  } catch {
    return false
  }
}

const isAncestor = (vaultDir: string, ref: string, of: string): boolean => {
  try {
    git(vaultDir, ['merge-base', '--is-ancestor', ref, of])
    return true
  } catch {
    return false
  }
}

/**
 * 올려 둔 요청이 아직 팀 확인을 기다리나 — 그 이름이 기본 줄기에 들어 있고(내 작업의 일부) 팀 최신에는 아직 없다.
 * 팀이 squash 로 머지하면 커밋이 아니라 내용으로 들어오므로 `landedIn` 이 본다. 올린 기록(원격 이름)이 없으면 모른다(null)
 */
const waiting = (vaultDir: string, branch: string, base: string): boolean | null => {
  const ref = `refs/remotes/origin/${branch}`
  if (!hasRef(vaultDir, ref)) return null
  if (!isAncestor(vaultDir, ref, base)) return false
  const upstream = `refs/remotes/origin/${base}`
  if (!hasRef(vaultDir, upstream)) return true
  return !isAncestor(vaultDir, ref, upstream) && !landedIn(vaultDir, ref, upstream)
}

/**
 * 내 수정이 실려 갈 요청 — 내가 연 수정 요청, 없으면 팀 확인 중인 위키화(승인한 것이 기본 줄기에 병합돼 있다).
 * 위키화가 기다리는 중이면 새 요청을 따로 열지 않는다: 따로 열면 위키화 페이지가 두 요청에 같이 실린다.
 * 팀에 들어갔거나 기본 줄기에서 빠진 내 수정 요청은 잊는다 — "팀 확인 중" 이 닫힌 요청을 가리키지 않게.
 */
export const pendingReview = (vaultDir: string, base: string): EditShare | null => {
  const own = readEditShare(vaultDir)
  if (own !== null) {
    const state = waiting(vaultDir, own.branch, base)
    if (state === false) forget(vaultDir)
    else return own
  }
  const candidates = Object.entries(listTeamReviews(vaultDir))
    .filter(([branch]) => waiting(vaultDir, branch, base) === true)
    .map(([branch, review]) => ({ branch, number: review.number, url: review.url }))
  // 여럿이면 가장 나중 것 — 앞선 위키화를 품고 있다
  return (
    candidates.sort(
      (a, b) =>
        Number(git(vaultDir, ['rev-list', '--count', `refs/remotes/origin/${b.branch}`]).trim()) -
        Number(git(vaultDir, ['rev-list', '--count', `refs/remotes/origin/${a.branch}`]).trim())
    )[0] ?? null
  )
}

/**
 * 화면에 보일 요청 상태. 안 올린 작업이 없으면(팀이 합쳤거나 다른 길로 올라갔다) 기억을 지운다.
 * `unsent` = 요청에 아직 안 실린 새 작업 수 — 올린 이름을 이 보관함이 모르면 안 올린 작업 전부다.
 */
export const editShareState = async (
  vaultDir: string,
  ahead: number
): Promise<{ url: string; unsent: number } | null> => {
  if (ahead === 0) {
    forget(vaultDir)
    return null
  }
  const branch = defaultBranchOf(vaultDir)
  if (!branch) {
    const share = readEditShare(vaultDir)
    return share === null ? null : { url: share.url, unsent: ahead }
  }
  const share = pendingReview(vaultDir, branch)
  if (share === null) return null
  // 요청 뒤에 내가 새로 만든 커밋만 — 팀 변경을 받으며 생긴 병합 커밋·팀 커밋은 새 수정이 아니다
  const run = await spawnGit(vaultDir, [
    'rev-list',
    '--count',
    '--no-merges',
    branch,
    `^refs/remotes/origin/${share.branch}`,
    `^refs/remotes/origin/${branch}`
  ])
  const unsent = run.ok ? Number(run.stdout.trim() || '0') : ahead
  return { url: share.url, unsent }
}

/** 2026-09-24 14:05 → `app/edits-2026-09-24-1405` — 이 컴퓨터의 시각 */
/** 이미 올린 적 있는 이름이면(같은 분에 다시 보냄) `-2`·`-3` 을 붙인다 — 남아 있는 옛 요청 브랜치에 밀어 넣으면 거절된다 */
const branchName = (vaultDir: string, now: Date): string => {
  const base = `app/edits-${now.toLocaleString('sv-SE').slice(0, 16).replace(' ', '-').replace(':', '')}`
  const taken = (name: string): boolean => hasRef(vaultDir, `refs/remotes/origin/${name}`)
  if (!taken(base)) return base
  for (let n = 2; ; n += 1) if (!taken(`${base}-${n}`)) return `${base}-${n}`
}

// ui-hangul-ignore: 팀에 여는 요청 제목·본문 — 볼트 데이터처럼 화면 언어와 따로 간다(D8)
const titleOf = (files: string[]): string =>
  files.length <= 1
    ? `edit: ${files[0] ?? '내 수정'}`
    : `edit: ${files[0]} 외 ${files.length - 1}개`

// ui-hangul-ignore: 팀에 여는 요청 본문 — 볼트 데이터(D8)
const bodyOf = (files: string[]): string =>
  ['2nd-brain 앱에서 고친 문서다. 확인하고 합친다.', '', ...files.map((file) => `- ${file}`)].join(
    '\n'
  )

export const shareEdits = async (
  vaultDir: string,
  files: string[],
  deps: EditShareDeps
): Promise<EditShareResult> => {
  const remote = readRemote(vaultDir)
  if (!remote) {
    return {
      ok: false,
      reason: mainT().syncMain.notLinked
    }
  }
  // 승인 보내기·지금 올리기와 같은 문 — 공개 저장소면 올리기 전에 막는다
  if ((await deps.isPublic(remote.webUrl)) === true) {
    return { ok: false, reason: mainT().syncMain.publicRepo }
  }
  const base = defaultBranchOf(vaultDir)
  if (!base) return { ok: false, reason: mainT().mainErrors.noDefaultBranch }

  // 팀 확인 중인 위키화가 기본 줄기에 들어 있으면 수정도 그 요청에 싣는다 — 같은 이름으로 다시 올리면 더해진다
  // 올린 이름은 팀이 요청을 닫아도 이 보관함에 남는다 — 아직 열려 있는지 물어본 뒤에만 싣는다
  const carrier = pendingReview(vaultDir, base)
  const carrierOpen =
    carrier !== null && readEditShare(vaultDir) === null
      ? await deps.isOpen(remote.url, carrier.number)
      : false
  if (carrierOpen === null) {
    return {
      ok: false,
      reason: mainT().reviewMain.draftPrUnknown
    }
  }
  if (carrier !== null && carrierOpen) {
    const pushed = await deps.push(vaultDir, base, carrier.branch)
    if (!pushed.ok) return pushed
    return { ok: true, share: carrier, added: true }
  }

  const before = readEditShare(vaultDir)
  const open = before === null ? false : await deps.isOpen(remote.url, before.number)
  // 열려 있는지 모르는 채 새로 열면 같은 수정이 두 요청에 실린다
  if (open === null) {
    return {
      ok: false,
      reason: mainT().reviewMain.editPrUnknown
    }
  }
  const branch = before !== null && open ? before.branch : branchName(vaultDir, deps.now())
  const pushed = await deps.push(vaultDir, base, branch)
  if (!pushed.ok) return pushed
  if (before !== null && open) return { ok: true, share: before, added: true }

  const opened = await deps.openPullRequest({
    url: remote.url,
    branch,
    base,
    title: titleOf(files),
    body: bodyOf(files)
  })
  if (!opened.ok) return opened
  const share = { branch, number: opened.number, url: opened.url }
  writeJsonAtomic(store(vaultDir), share)
  return { ok: true, share, added: false }
}
