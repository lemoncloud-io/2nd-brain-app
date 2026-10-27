// GitHub 로그인 IPC — device flow 한 번으로 끝난다. 토큰은 OS 키체인으로 암호화해 두고 화면에 보내지 않는다.
// 이 로그인 하나로 올리기·받기·가져오기(git)와 팀 확인 요청(REST)을 모두 한다.
import { app, ipcMain, safeStorage } from 'electron'
import { APP_CHANNELS, type GithubAuthState } from '../../shared/ipc-contract'
import { createDeviceAuth, type DeviceAuth } from '../github/device-auth'
import { createTokenStore } from '../github/token-store'
import { fetchGithubUser, parseGithubUser, type GithubUser } from '../github/user'
import { listOrgs, listTeamVaults } from '../github/repos'
import { setGithubTokenSource } from '../git'
import { setAppUser } from '../vault/app-identity'
import { loadSettings, saveSettings } from '../settings'

/** 공개값이다(public client). 배포본을 바꾸지 않고 시험하려면 환경변수로 덮는다 */
const CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? 'Ov23li3YAoajBS8zWOgs'

let auth: DeviceAuth | null = null

const githubAuth = (): DeviceAuth => {
  auth ??= createDeviceAuth({
    clientId: CLIENT_ID,
    fetch: globalThis.fetch,
    store: createTokenStore(app.getPath('userData'), safeStorage)
  })
  return auth
}

/** 다른 main 모듈이 쓰는 토큰 — 없으면 null */
export const githubToken = (): string | null => githubAuth().token()

const savedUser = (): GithubUser | null =>
  parseGithubUser(loadSettings(app.getPath('userData')).githubUser)

/** 커밋 작성자로 쓸 아이디를 바꾸고 다음 실행을 위해 적어 둔다 */
const rememberUser = (user: GithubUser | null): void => {
  setAppUser(user)
  const dir = app.getPath('userData')
  const settings = loadSettings(dir)
  if (user === null) delete settings.githubUser
  else settings.githubUser = user
  saveSettings(dir, settings)
}

/** 로그인한 아이디를 GitHub 에 묻는다 — 읽지 못하면 커밋은 앱 이름으로 남고, 다음 실행에 다시 묻는다 */
const learnUser = async (): Promise<void> => {
  const token = githubToken()
  const user = await fetchGithubUser({ token, fetch: globalThis.fetch })
  // 묻는 사이 로그아웃했거나 다른 계정으로 다시 로그인했으면 적지 않는다 — 옛 답이 새 계정을 덮는다
  if (user !== null && token !== null && githubToken() === token) rememberUser(user)
}

/** 로그인한 아이디 — 아직 적어 두지 않았으면 GitHub 에 물어 적는다. 로그인 전이거나 묻지 못하면 null */
export const githubLogin = async (): Promise<string | null> => {
  if (githubToken() === null) return null
  if (savedUser() === null) await learnUser()
  return savedUser()?.login ?? null
}

export const registerGithubHandlers = (): void => {
  setGithubTokenSource(githubToken)
  // 로그인돼 있을 때만 그 아이디로 커밋한다 — 토큰을 못 읽으면(다른 컴퓨터로 옮긴 설정) 앱 이름이다
  const saved = savedUser()
  if (githubToken() === null) setAppUser(null)
  else if (saved !== null) setAppUser(saved)
  // 아이디를 적어 두기 전에 로그인한 사람(이 기능 이전 버전) — 답이 오기 전 첫 받기의 `save:` 는 앱 이름으로 남는다
  else void learnUser()

  ipcMain.handle(APP_CHANNELS.githubAuthState, (): GithubAuthState => {
    if (githubToken() === null) return { loggedIn: false }
    const login = savedUser()?.login
    return login === undefined ? { loggedIn: true } : { loggedIn: true, login }
  })
  // 코드를 받아 화면에 보여 준다. 사람이 브라우저에서 승인하는 동안 앱은 그대로 쓸 수 있다
  ipcMain.handle(APP_CHANNELS.githubAuthStart, () => githubAuth().start())
  // 승인이 끝날 때까지 기다린다 — 화면은 이 약속이 풀릴 때 결과를 받는다
  ipcMain.handle(APP_CHANNELS.githubAuthFinish, async () => {
    const result = await githubAuth().finish()
    if (result.ok) await learnUser()
    return result
  })
  ipcMain.handle(APP_CHANNELS.githubOrgs, () =>
    listOrgs({ token: githubToken(), fetch: globalThis.fetch })
  )
  ipcMain.handle(APP_CHANNELS.githubTeamVaults, () =>
    listTeamVaults({ token: githubToken(), fetch: globalThis.fetch })
  )
  ipcMain.handle(APP_CHANNELS.githubSignOut, () => {
    githubAuth().signOut()
    rememberUser(null)
  })
}
