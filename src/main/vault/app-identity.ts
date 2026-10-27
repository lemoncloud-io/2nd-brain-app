// 앱이 만드는 커밋의 작성자 — GitHub 에 로그인했으면 그 사람의 GitHub 아이디, 아니면 앱 이름.
// 문서 기록이 "AI가 씀 · 내가 고침 · 누가 고침" 을 가르는 근거다. 이메일은 GitHub 의 noreply 주소라 공개돼도 된다.
import type { GithubUser } from '../github/user'

export const APP_NAME = '2nd-brain'
export const APP_EMAIL = 'vault@2nd-brain.local'
/** 예전 이름으로 남은 앱 커밋 — 이미 쓰던 보관함의 기록을 계속 앱 것으로 가른다 */
export const PAST_APP_NAMES: readonly string[] = ['eureka-wiki', '2nd-brain Desktop']

/** 지금 로그인한 사람 — main 이 시작할 때·로그인·로그아웃 때 바꾼다(`ipc/github-handlers.ts`) */
let user: GithubUser | null = null

export const setAppUser = (next: GithubUser | null): void => {
  user = next
}

const noreplyEmail = (who: GithubUser): string => `${who.id}+${who.login}@users.noreply.github.com`

/** 내 커밋의 이메일 — 로그인하지 않았으면 null(앱 이름 커밋은 누구 것인지 가를 수 없다) */
export const appUserEmail = (): string | null => (user === null ? null : noreplyEmail(user))

/** 커밋 앞에 붙이는 `-c user.name=… -c user.email=…` — 사용자 전역 git 설정보다 앞선다 */
export const appIdentity = (): string[] =>
  user === null
    ? ['-c', `user.name=${APP_NAME}`, '-c', `user.email=${APP_EMAIL}`]
    : ['-c', `user.name=${user.login}`, '-c', `user.email=${noreplyEmail(user)}`]
