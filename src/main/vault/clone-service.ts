// 팀 보관함에 들어가기 — 주소 하나로 받아 바로 여는 경로. 터미널을 열지 않는다.
// 받는 일은 오래 걸리고 GitHub 로그인 토큰을 실어야 해서 `spawnGit()` 창구를 탄다.
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { spawnGit, type GitFailure } from '../git'
import { failureKind, lastStderrLine } from '../git-failure'
import { isFullVault, openVault, REQUIRED_ENTRIES } from './vault-service'
import { mainT } from '../i18n'

/**
 * 실패의 갈래 — empty = 커밋이 아직 없다 · missing = 저장소가 안 보인다(방금 만든 저장소면 둘 다 잠시 뒤 다시 받을 만하다)
 * · not-vault = 받았지만 보관함이 아니다
 */
export type CloneFailureKind = 'empty' | 'missing' | 'not-vault'
export type CloneResult =
  { ok: true; dir: string } | { ok: false; reason: string; kind?: CloneFailureKind }

/**
 * 주소 끝의 저장소 이름 — 받은 것을 담을 폴더 이름이 된다. 폴더 이름으로 쓸 수 없으면 null:
 * `.`·`..` 를 그대로 쓰면 고른 폴더나 그 부모를 가리키고, 실패 정리(rmSync)가 남의 폴더를 지운다.
 */
export const repoFolderName = (url: string): string | null => {
  const trimmed = url.replace(/[/\\]+$/, '')
  const last =
    trimmed
      .split(/[/\\:]/)
      .filter(Boolean)
      .at(-1) ?? ''
  const name = last.replace(/\.git$/, '')
  if (name === '' || name === '.' || name === '..') return null
  return /^[A-Za-z0-9._-]+$/.test(name) ? name : null
}

/** git clone 실패 → 사용자가 할 일 */
export const cloneFailureMessage = (run: GitFailure): string => {
  const { stderr } = run
  switch (failureKind(run)) {
    case 'login':
      return mainT().syncMain.cloneLogin
    case 'auth':
      return mainT().githubMain.signedOut
    case 'not-found':
      return mainT().syncMain.cloneNotFound
    case 'offline':
      return mainT().syncMain.cloneOffline
    default:
      return `${mainT().syncMain.cloneFailed}${lastStderrLine(stderr)}`
  }
}

/** 받은 것을 치운다 — 미리 있던 빈 폴더(`into`)는 폴더째 지우지 않고 비우기만 한다 */
const clearOut = (dir: string, keepDir: boolean): void => {
  // 치우기가 실패해도(Windows 파일 잠금 등) 받기 실패의 원래 사유를 돌려준다 — 다음 시도가 "이미 있다" 로 말한다
  try {
    if (!existsSync(dir)) return
    if (!keepDir) {
      rmSync(dir, { recursive: true, force: true })
      return
    }
    for (const entry of readdirSync(dir)) rmSync(join(dir, entry), { recursive: true, force: true })
  } catch (error) {
    console.error('could not clean up the partial clone', dir, error)
  }
}

/**
 * `parentDir` 안에 저장소 이름 폴더를 만들어 받는다(`into` 를 주면 그 폴더에). 받은 것이 보관함이 아니면 그 폴더를
 * 비우고 거절한다 — 반쯤 받은 폴더를 남기면 다음 시도가 "이미 있다" 로 막힌다.
 */
export const cloneVault = async (
  url: string,
  parentDir: string,
  opts: { into?: string } = {}
): Promise<CloneResult> => {
  const name = opts.into === undefined ? repoFolderName(url) : basename(opts.into)
  if (name === null) {
    return {
      ok: false,
      reason: mainT().syncMain.cloneBadUrl
    }
  }
  const dir = opts.into ?? join(parentDir, name)
  const existed = existsSync(dir)
  if (existed && readdirSync(dir).length > 0) {
    return {
      ok: false,
      reason: mainT().syncMain.cloneExists(name)
    }
  }
  const run = await spawnGit(dirname(dir), ['clone', url, name], { timeoutMs: 60_000 })
  if (!run.ok) {
    clearOut(dir, existed)
    if (run.failure === 'timeout') {
      return {
        ok: false,
        reason: mainT().syncMain.cloneTimeout
      }
    }
    if (run.failure === 'spawn') {
      return { ok: false, reason: `${mainT().syncMain.cloneFailed} — ${run.stderr}` }
    }
    const reason = cloneFailureMessage(run)
    return failureKind(run) === 'not-found'
      ? { ok: false, reason, kind: 'missing' }
      : { ok: false, reason }
  }
  // 커밋이 없는 저장소는 clone 이 성공으로 끝난다 — 템플릿으로 막 만든 저장소는 내용이 늦게 찬다
  if (readdirSync(dir).every((entry) => entry === '.git')) {
    clearOut(dir, existed)
    return {
      ok: false,
      reason: mainT().syncMain.cloneEmpty,
      kind: 'empty'
    }
  }
  const opened = openVault(dir)
  if (!isFullVault(opened)) {
    clearOut(dir, existed)
    // 읽기 중심(generic)으로 열려도 무엇이 빠졌는지 이름으로 말한다
    const missing = opened.ok
      ? REQUIRED_ENTRIES.filter((entry) => !existsSync(join(dir, entry)))
      : opened.missing
    const detail =
      missing.length > 0
        ? mainT().syncMain.cloneMissing(missing.join('·'))
        : mainT().syncMain.cloneReadOnly
    return {
      ok: false,
      reason: mainT().syncMain.cloneNotVault(detail),
      kind: 'not-vault'
    }
  }
  return { ok: true, dir }
}
