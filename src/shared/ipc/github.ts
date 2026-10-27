export const APP_CHANNELS_GITHUB = {
  githubAuthState: 'github:auth-state',
  githubAuthStart: 'github:auth-start',
  githubAuthFinish: 'github:auth-finish',
  githubSignOut: 'github:sign-out',
  githubOrgs: 'github:orgs',
  githubTeamVaults: 'github:team-vaults'
} as const

/** GitHub 로그인 상태 — 토큰 자체는 화면에 오지 않는다. `login` 은 읽어 두었으면 GitHub 아이디 */
export type GithubAuthState = { loggedIn: boolean; login?: string }

/** device flow 시작 결과 — 사람이 브라우저에 넣을 여덟 글자와 주소 */
export type GithubAuthStart =
  { ok: true; userCode: string; verificationUri: string } | { ok: false; reason: string }

/** GitHub REST 실패 — `reason` 은 할 일, `detail` 은 GitHub 가 한 말("자세히"), `link` 는 고칠 곳(GitHub 설정 화면) */
export type GithubFailure = { ok: false; reason: string; detail?: string; link?: string }

/** 팀 저장소를 만들 수 있는 조직 — `relogin` 은 예전 로그인이라 조직을 읽을 권한이 없다는 뜻(내 계정에는 만들 수 있다) */
export type GithubOrgs = { ok: true; orgs: string[] } | (GithubFailure & { relogin?: true })

/**
 * 팀 저장소 만들기 — 만들고 연결해 첫 올리기까지. `url` 은 만든 저장소 주소.
 * 실패에 `connected` 가 있으면 저장소는 만들어 연결까지 됐고 올리기만 못 했다 — 화면은 연결됨으로 넘어간다.
 * `exists` 는 같은 이름 저장소가 이미 있다는 뜻 — 부르는 쪽이 다른 이름으로 다시 만든다
 */
export type CreateTeamRepoResult =
  { ok: true; url: string } | (GithubFailure & { connected?: true; exists?: true })

/** 들어갈 수 있는 팀 보관함 — `url` 은 받을 주소(https://github.com/…) */
export type TeamVault = { fullName: string; url: string }
/** 받은 초대 — 수락해야 저장소가 보인다. 보관함인지는 수락 전에는 알 수 없다 */
export type TeamInvitation = { id: number; fullName: string; url: string; inviter: string }
export type TeamVaults =
  { ok: true; vaults: TeamVault[]; invitations: TeamInvitation[] } | GithubFailure

/** 팀원 초대 — invited = 초대를 보냈다(수락하면 들어온다) · already = 이미 들어와 있다 */
export type InviteResult = { ok: true; state: 'invited' | 'already' } | GithubFailure

/** 팀이 확인 중인 것 — 승인한 묶음 하나에 PR 하나 */
export type TeamReview = { number: number; url: string }

export interface AppApiGithub {
  githubAuthState(): Promise<GithubAuthState>
  /** 로그인 시작 — 화면에 보여 줄 코드를 받는다 */
  githubAuthStart(): Promise<GithubAuthStart>
  /** 사람이 브라우저에서 승인할 때까지 기다린다 */
  githubAuthFinish(): Promise<{ ok: true } | { ok: false; reason: string }>
  githubSignOut(): Promise<void>
  /** 팀 저장소를 만들 수 있는 조직 목록 */
  githubOrgs(): Promise<GithubOrgs>
  /** 들어갈 수 있는 팀 보관함과 받은 초대 */
  githubTeamVaults(): Promise<TeamVaults>
}
