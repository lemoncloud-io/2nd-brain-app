// 첫 실행 보관함 — 로그인한 계정에 템플릿으로 비공개 저장소를 만들고 기본 위치로 받는다. 사람은 폴더도 저장소도 고르지 않는다.
// 템플릿을 볼 수 없는 계정(비공개 템플릿 404)은 앱 뼈대로 만들고 내 비공개 저장소를 만들어 올린다 — 누구나 올리기까지 간다.
import type { GithubCall } from '../github/api'
import {
  createTeamRepo,
  FULL_NAME,
  generateFromTemplate,
  STARTER_NAME_TRIES,
  starterRepoName
} from '../github/repos'
import type { PushResult } from '../../shared/ipc-contract'
import type { CloneResult } from './clone-service'
import { newVaultDir, type CreateResult } from './vault-service'
import { mainT } from '../i18n'

export type TemplateVaultDeps = {
  github: GithubCall
  /** 템플릿 저장소 `owner/name` */
  template: string
  /** 받을 주소를 `dir`(빈 폴더)로 받고 보관함인지 본다 */
  clone: (url: string, dir: string) => Promise<CloneResult>
  wait: (ms: number) => Promise<void>
  /** 만들었지만 아직 받지 못한 저장소 — 다시 눌렀을 때 새로 만들지 않고 이것을 받는다 */
  pending: { get(): string | undefined; set(fullName: string | undefined): void }
  /** 앱 뼈대로 빈 폴더에 보관함을 만든다 */
  skeleton: (dir: string) => CreateResult
  /** 보관함을 빈 저장소에 연결하고 첫 올리기까지 */
  connect: (dir: string, url: string) => Promise<PushResult>
}

export type TemplateVaultResult =
  | {
      ok: true
      dir: string
      repo: string
      via: 'template' | 'skeleton'
      /** 보관함은 만들었지만 GitHub 에 올리지 못했다 — 무엇이 안 됐는지 */
      publishError?: string
    }
  | { ok: false; reason: string; detail?: string }

/** 템플릿으로 막 만든 저장소는 내용이 늦게 찰 수 있다 — 이 간격으로 이만큼 다시 받는다(문서에 동기 여부가 없다) */
const CLONE_TRIES = 5
const CLONE_WAIT_MS = 3_000

const githubUrl = (fullName: string): string => `https://github.com/${fullName}.git`

const cloneWithRetry = async (
  deps: TemplateVaultDeps,
  url: string,
  dir: string
): Promise<CloneResult> => {
  let result = await deps.clone(url, dir)
  const again = (r: CloneResult): boolean => !r.ok && (r.kind === 'empty' || r.kind === 'missing')
  for (let n = 1; n < CLONE_TRIES && again(result); n += 1) {
    await deps.wait(CLONE_WAIT_MS)
    result = await deps.clone(url, dir)
  }
  return result
}

/** 템플릿을 볼 수 없을 때 — 앱 뼈대로 만들고 `2nd-brain`(겹치면 -2…) 비공개 저장소에 올린다 */
const fromSkeleton = async (
  deps: TemplateVaultDeps,
  parentDir: string,
  login: string
): Promise<TemplateVaultResult> => {
  const dir = newVaultDir(parentDir, { inside: true })
  const made = deps.skeleton(dir)
  if (!made.ok) return made
  for (let n = 1; n <= STARTER_NAME_TRIES; n += 1) {
    const created = await createTeamRepo(deps.github, { org: null, name: starterRepoName(n) })
    if (!created.ok && created.exists) continue
    // 보관함은 이미 생겼다 — 올리기 실패는 연다음 "GitHub에 올리기" 걸음으로 남는다
    if (!created.ok)
      return { ok: true, dir, repo: '', via: 'skeleton', publishError: created.reason }
    const repo = `${login}/${starterRepoName(n)}`
    // 저장소는 GitHub 에 생겼다 — 잇기가 던져도 보관함은 열고, 올리지 못한 것은 "GitHub에 올리기" 걸음으로 남긴다
    try {
      const pushed = await deps.connect(dir, created.url)
      return pushed.ok
        ? { ok: true, dir, repo, via: 'skeleton' }
        : { ok: true, dir, repo, via: 'skeleton', publishError: pushed.reason }
    } catch (error) {
      console.error('could not link the first-run vault to the repo', repo, error)
      return {
        ok: true,
        dir,
        repo,
        via: 'skeleton',
        publishError: mainT().syncMain.createdNotLinked
      }
    }
  }
  return { ok: true, dir, repo: '', via: 'skeleton', publishError: mainT().githubMain.repoExists }
}

export const createVaultFromTemplate = async (
  deps: TemplateVaultDeps,
  input: { parentDir: string; login: string }
): Promise<TemplateVaultResult> => {
  const remembered = deps.pending.get()
  // 다른 계정으로 다시 로그인했으면 그 계정이 만들던 저장소는 받지 않는다
  const owned =
    remembered !== undefined &&
    FULL_NAME.test(remembered) &&
    remembered.split('/')[0]?.toLowerCase() === input.login.toLowerCase()
  let repo: string
  if (owned) {
    repo = remembered
  } else {
    const generated = await generateFromTemplate(deps.github, {
      template: deps.template,
      owner: input.login
    })
    if (!generated.ok) {
      if (generated.templateHidden) {
        // 템플릿을 옮기거나 지우면 모두가 말없이 이 길로 온다 — 원인은 로그에 남긴다
        console.warn(
          'template unavailable — using the bundled skeleton',
          deps.template,
          generated.detail
        )
        return fromSkeleton(deps, input.parentDir, input.login)
      }
      const { reason, detail } = generated
      return detail === undefined ? { ok: false, reason } : { ok: false, reason, detail }
    }
    repo = generated.fullName
    deps.pending.set(repo)
  }
  const cloned = await cloneWithRetry(
    deps,
    githubUrl(repo),
    newVaultDir(input.parentDir, { inside: true })
  )
  if (!cloned.ok) {
    // 보관함이 아니면 다시 받아도 같다 — 기록을 지워 다음에 새로 만든다. 기억해 두었던 저장소가 안 보이면 사람이 지운 것이다.
    // 방금 만든 저장소가 안 보이는 것은 GitHub 이 늦는 것이라 기억해 두고 같은 저장소를 다시 받는다
    if (cloned.kind === 'not-vault' || (owned && cloned.kind === 'missing')) {
      deps.pending.set(undefined)
    }
    return { ok: false, reason: cloned.reason }
  }
  deps.pending.set(undefined)
  return { ok: true, dir: cloned.dir, repo, via: 'template' }
}
