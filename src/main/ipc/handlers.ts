import { app, BrowserWindow, ipcMain } from 'electron'
import { APP_CHANNELS } from '../../shared/ipc-contract'
import type { ClaudeStatus, EngineStatus, InstallResult } from '../../shared/ipc-contract'
import { buildAppInfo } from '../app-info'
import { normalizeLanguage } from '../../shared/language'
import { changeLanguage } from '../i18n'
import {
  getClaudeAuthStatus,
  logoutClaude,
  resolveClaudeCli,
  startClaudeLogin
} from '../cli/claude-cli'
import { cancelInstalls, installCli } from '../cli/install-cli'
import { join } from 'node:path'
import { broadcast } from './broadcast'
import { loadSettings, normalizeOnboardingPurpose, saveSettings } from '../settings'
import {
  chatSessionBase,
  createEngineFactory,
  engineCliOf,
  type EngineCli
} from '../engine/create-engine'
import { getCodexAuthStatus, logoutCodex, resolveCodexCli, startCodexLogin } from '../cli/codex-cli'
import { normalizeEngineSettings } from '../../shared/engine-settings'
import { normalizeMcpServers } from '../../shared/mcp-servers'
import { probeMcpServer as probeMcp } from '../engine/mcp-probe'
import { normalizeChatDefaults, updateChatDefaults } from '../../shared/chat-defaults'
import { normalizeUiPrefs } from '../../shared/ui-prefs'
import { createUsageReader } from '../usage/usage-service'
import { quitGuard } from '../window/quit-guard'
import { resumeUpdateInstall } from './update-handlers'
import { mainT } from '../i18n'
import { rememberMcpSecrets } from '../diagnostics/install'

/** 모든 엔진은 이 팩토리로 만든다 — 호출 때마다 settings.json 을 읽는다 */
export const createEngine = createEngineFactory(() => loadSettings(app.getPath('userData')))

/** 켜 둔 채팅 세션의 모델·MCP — 질문마다 settings.json 을 읽는다 */
export const chatSessionBaseFor = (cli: EngineCli): ReturnType<typeof chatSessionBase> =>
  chatSessionBase(loadSettings(app.getPath('userData')), cli)

export const getClaudeStatus = async (): Promise<ClaudeStatus> => {
  const settings = loadSettings(app.getPath('userData'))
  const env = { ...process.env }
  if (settings.claudePath) env.CLAUDE_CLI_PATH = settings.claudePath
  const cli = await resolveClaudeCli(env)
  if ('missing' in cli) return { cli, auth: { loggedIn: false } }
  try {
    const auth = await getClaudeAuthStatus(cli.path)
    return { cli, auth }
  } catch (error) {
    // 상태를 못 읽은 것과 로그아웃은 다르다 — 합치면 통하지 않는 로그인 버튼만 보이는 막다른 길이 된다
    console.error('could not read claude auth status', error)
    return { cli, auth: { loggedIn: false, unknown: true } }
  }
}

/** 설정에서 고른 엔진 CLI 의 설치·로그인 상태 */
export const getEngineStatus = async (): Promise<EngineStatus> => {
  const { engine } = normalizeEngineSettings(loadSettings(app.getPath('userData')))
  if (engine === 'claude') return { engine, ...(await getClaudeStatus()) }
  const cli = await resolveCodexCli(process.env)
  if ('missing' in cli) return { engine, cli, auth: { loggedIn: false } }
  try {
    return { engine, cli, auth: await getCodexAuthStatus(cli.path) }
  } catch (error) {
    // Claude 와 같은 이유로 가른다 — 상태를 못 읽은 것을 로그아웃으로 부르면 막다른 길이 된다
    console.error('could not read codex login status', error)
    return { engine, cli, auth: { loggedIn: false, unknown: true } }
  }
}

/** 엔진을 만들기 전에 고른 CLI 를 확인한다 — 없거나 미로그인이면 사유 */
export const resolveEngineCli = async (): Promise<EngineCli | { error: string }> =>
  engineCliOf(await getEngineStatus())

/** 사용량 창구는 하나다 — 캐시와 겹친 요청 합치기가 이 안에 있다 */
const readAccountUsage = createUsageReader()

export const registerAppHandlers = (): void => {
  ipcMain.handle(APP_CHANNELS.getAppInfo, () =>
    buildAppInfo({
      version: app.getVersion(),
      platform: process.platform,
      electronVersion: process.versions.electron
    })
  )
  // 버리기를 확인한 뒤의 닫기다 — destroy 로 beforeunload 를 건너뛰지 않으면 같은 확인이 다시 걸린다.
  // ⌘Q 가 저장 안 한 글에 막혔던 거면 종료를 잇는다 — 이제 막을 글이 없어 창이 닫히고 앱이 끝난다
  ipcMain.handle(APP_CHANNELS.closeWindow, (event) => {
    const resume = quitGuard.resumesQuit()
    // 막혔던 설치는 mac 에서만 다시 부른다 — Windows 는 electron-updater 가 설치기를 이미 띄웠고 두 번째 설치 호출을
    // 무시한다(BaseUpdater quitAndInstallCalled). 설치가 거절되면(상태가 바뀌었다) 그냥 끝낸다 — 버리기가 헛돌지 않게
    if (resume === 'update' && process.platform === 'darwin' && resumeUpdateInstall()) return
    if (resume !== null) app.quit()
    else BrowserWindow.fromWebContents(event.sender)?.destroy()
  })
  ipcMain.handle(APP_CHANNELS.getEngineStatus, () => getEngineStatus())
  ipcMain.handle(APP_CHANNELS.setTheme, (_event, theme: unknown) => {
    const value = theme === 'dark' ? 'dark' : 'light'
    saveSettings(app.getPath('userData'), {
      ...loadSettings(app.getPath('userData')),
      theme: value
    })
    return value
  })
  ipcMain.handle(APP_CHANNELS.getLanguage, () =>
    normalizeLanguage(loadSettings(app.getPath('userData')).language)
  )
  ipcMain.handle(APP_CHANNELS.setLanguage, (_event, raw: unknown) =>
    changeLanguage(app.getPath('userData'), raw, (language) =>
      broadcast(APP_CHANNELS.languageChanged, language)
    )
  )
  ipcMain.handle(APP_CHANNELS.getChatDefaults, () =>
    normalizeChatDefaults(loadSettings(app.getPath('userData')).chatDefaults)
  )
  // renderer 입력 — 정규화해 저장하고 실제로 저장된 값을 돌려준다
  ipcMain.handle(APP_CHANNELS.setChatDefaults, (_event, raw: unknown) => {
    const dir = app.getPath('userData')
    const settings = loadSettings(dir)
    const chatDefaults = updateChatDefaults(settings.chatDefaults, raw)
    saveSettings(dir, { ...settings, chatDefaults })
    return chatDefaults
  })
  ipcMain.handle(
    APP_CHANNELS.getOnboardingPurpose,
    () => loadSettings(app.getPath('userData')).onboardingPurpose ?? null
  )
  // renderer 입력 — 정규화해 저장한다. 빈 답은 지운다(보관함은 기본 purpose.md 로 간다)
  ipcMain.handle(APP_CHANNELS.setOnboardingPurpose, (_event, raw: unknown) => {
    const text = normalizeOnboardingPurpose(raw)
    const dir = app.getPath('userData')
    const settings = loadSettings(dir)
    if (text === null) delete settings.onboardingPurpose
    else settings.onboardingPurpose = text
    saveSettings(dir, settings)
    return text
  })
  ipcMain.handle(APP_CHANNELS.getMcpServers, () =>
    normalizeMcpServers(loadSettings(app.getPath('userData')).mcpServers)
  )
  // renderer 입력 — 정규화해 저장하고 실제로 저장된 값을 돌려준다
  ipcMain.handle(APP_CHANNELS.setMcpServers, (_event, raw: unknown) => {
    const mcpServers = normalizeMcpServers(raw)
    const dir = app.getPath('userData')
    saveSettings(dir, { ...loadSettings(dir), mcpServers })
    rememberMcpSecrets(mcpServers)
    return mcpServers
  })
  // renderer 입력 — 저장된 서버 이름. 닿는지 직접 확인하고 결과를 돌려준다
  ipcMain.handle(APP_CHANNELS.probeMcpServer, async (_event, raw: unknown) => {
    if (typeof raw !== 'string' || raw === '')
      return { ok: false, reason: mainT().mainErrors.pickServerFailed }
    const found = normalizeMcpServers(loadSettings(app.getPath('userData')).mcpServers).find(
      (s) => s.name === raw
    )
    if (!found) return { ok: false, reason: mainT().mainErrors.serverNotSaved }
    return probeMcp(found)
  })
  // 자격증명은 이 선을 넘지 않는다 — 나가는 것은 비율과 리셋 시각뿐이다(PRODUCT.md § Naming)
  ipcMain.handle(APP_CHANNELS.getAccountUsage, (_event, fresh: unknown) =>
    readAccountUsage(fresh === true)
  )
  ipcMain.handle(APP_CHANNELS.getUiPrefs, () =>
    normalizeUiPrefs(loadSettings(app.getPath('userData')).uiPrefs)
  )
  // renderer 입력 — 정규화해 저장하고 실제로 저장된 값을 돌려준다
  ipcMain.handle(APP_CHANNELS.setUiPrefs, (_event, raw: unknown) => {
    const uiPrefs = normalizeUiPrefs(raw)
    const dir = app.getPath('userData')
    saveSettings(dir, { ...loadSettings(dir), uiPrefs })
    return uiPrefs
  })
  ipcMain.handle(APP_CHANNELS.getEngineSettings, () =>
    normalizeEngineSettings(loadSettings(app.getPath('userData')))
  )
  // renderer 입력 — 정규화해 저장하고 실제로 저장된 값을 돌려준다
  ipcMain.handle(APP_CHANNELS.setEngineSettings, (_event, raw: unknown) => {
    const next = normalizeEngineSettings(raw)
    // 옛 용도별 models 는 여기서 걷어 낸다 — 남겨 두면 model 을 비웠을 때 옛 채팅 모델이 되살아난다
    const settings = loadSettings(app.getPath('userData'))
    delete settings.models
    saveSettings(app.getPath('userData'), {
      ...settings,
      engine: next.engine,
      model: next.model,
      draftModel: next.draftModel
    })
    return next
  })
  // 설정에서 고른 엔진의 브라우저 로그인을 띄운다 — 끝났는지는 화면이 getEngineStatus 를 다시 물어 안다
  ipcMain.handle(APP_CHANNELS.startEngineLogin, async () => {
    const status = await getEngineStatus()
    if ('missing' in status.cli) throw new Error(status.cli.reason)
    if (status.engine === 'codex') {
      startCodexLogin(status.cli.path)
      return
    }
    startClaudeLogin(status.cli.path)
    saveSettings(app.getPath('userData'), {
      ...loadSettings(app.getPath('userData')),
      claudePath: status.cli.path
    })
  })
  // 고른 엔진의 CLI 를 설치한다. 인자를 받지 않는다 — 무엇을 돌릴지는 main 이 설정과 정본 표로 정한다
  ipcMain.handle(APP_CHANNELS.installEngine, (): Promise<InstallResult> => {
    const { engine } = normalizeEngineSettings(loadSettings(app.getPath('userData')))
    // e2e 주입구 — CLAUDE_CLI_PATH 와 같은 신뢰 수준이다(환경을 쥔 쪽은 이미 무엇이든 실행한다)
    const fake = process.env[`SECOND_BRAIN_INSTALL_CMD_${engine.toUpperCase()}`]
    return installCli(engine, {
      env: process.env,
      markerDir: join(app.getPath('userData'), 'installed-cli'),
      onLine: (line) => broadcast(APP_CHANNELS.installEvent, line),
      command: fake ? { file: fake, args: [] } : undefined
    })
  })
  app.on('before-quit', cancelInstalls)
  // 이 컴퓨터에서 로그인만 끊는다 — 보관함·위키는 건드리지 않는다. 끝난 상태를 그대로 돌려준다
  ipcMain.handle(APP_CHANNELS.logoutEngine, async (): Promise<EngineStatus> => {
    const status = await getEngineStatus()
    if ('missing' in status.cli) throw new Error(status.cli.reason)
    if (status.engine === 'codex') await logoutCodex(status.cli.path)
    else await logoutClaude(status.cli.path)
    return getEngineStatus()
  })
}
