import { app, shell, BrowserWindow, Menu, protocol } from 'electron'
import { APP_CHANNELS } from '../shared/ipc-contract'
import { currentVaultDir } from './ipc/clip-handlers'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerAppHandlers } from './ipc/handlers'
import { refreshTitles, registerVaultHandlers, setWindowOpener } from './ipc/vault-handlers'
import { registerSyncHandlers, runSync, watchTeam } from './ipc/sync-handlers'
import { registerGithubHandlers } from './ipc/github-handlers'
import { registerClipHandlers } from './ipc/clip-handlers'
import { registerWebHandlers } from './ipc/web-handlers'
import { isIngestRunning, registerIngestHandlers } from './ipc/ingest-handlers'
import { recoverNoteRuns, registerChatHandlers } from './ipc/chat-handlers'
import { registerReviewHandlers } from './ipc/review-handlers'
import {
  registerWikiHandlers,
  ensureVaultWatched,
  releaseIdleWatchers,
  releaseVaultWatch,
  stopAllWatches
} from './ipc/wiki-handlers'
import { registerSearchHandlers } from './ipc/search-handlers'
import { registerReviewItemHandlers } from './ipc/review-items-handlers'
import { registerUpdateHandlers, updateInstallStopped } from './ipc/update-handlers'
import { handleVaultPreviewFor, handleVaultRequestFor } from './vault/vault-protocol'
import { sendToVault } from './ipc/broadcast'
import { vaultActivity } from './vault/vault-activity'
import { openVault } from './vault/vault-service'
import { bindings, orderedVaultDirs } from './window/window-vaults'
import icon from '../../resources/icon.png?asset'
import { loadSettings } from './settings'
import { setMainLanguage } from './i18n'
import { themeArg } from '../shared/theme'
import { languageArg, normalizeLanguage } from '../shared/language'
import { quitGuard } from './window/quit-guard'
import { isCloseTabKey } from './window/close-tab-key'
import { buildMenuTemplate } from './menu/app-menu'
import { installLogger } from './diagnostics/install'
import { registerDiagnosticsHandlers } from './ipc/diagnostics-handlers'
import { askAfterRendererGone } from './diagnostics/renderer-gone'
import { developerMode, loadDeveloperMode } from './diagnostics/developer-mode'
import { shouldToggleDevTools } from './window/devtools-key'

function createWindow(opts: { vaultDir?: string } = {}): BrowserWindow {
  const settings = loadSettings(app.getPath('userData'))
  const theme = settings.theme ?? 'light'
  const language = normalizeLanguage(settings.language)
  // main 이 보내는 문구도 같은 언어로 — 창을 띄울 때마다 저장된 값과 맞춘다
  setMainLanguage(language)
  // 새 창은 고른 보관함에, 첫 창은 전역 설정에 묶인다. 지워진 폴더면 묶지 않는다.
  // 들어오는 표기는 하나로 — 바인딩·감시 키가 갈라지지 않게
  const picked = opts.vaultDir ?? settings.vaultDir ?? null
  const vaultDir = picked ? resolve(picked) : null
  const watched = vaultDir && openVault(vaultDir).ok ? vaultDir : null
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    // 레일·사이드바·중앙(최소 360)·우측 패널(최소 320)이 겹치지 않는 폭 — DESIGN.md § 셸
    minWidth: 1040,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 첫 페인트 깜빡임 방지 — 초기 테마·언어는 부팅 인자로 넘기고 preload 가 argv 에서 읽는다
      additionalArguments: [themeArg(theme), languageArg(language)],
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  const id = mainWindow.webContents.id
  if (watched) {
    bindings.bind(id, watched)
    ensureVaultWatched(watched)
  }

  mainWindow.on('ready-to-show', () => {
    // 페이지 <title>이 창 제목을 덮으므로 로드 뒤에 다시 쓴다 — 겹친 이름까지 구분한다
    refreshTitles()
    mainWindow.show()
  })

  // macOS 는 닫기 = 숨기기 — 탭·채팅·쓰던 글을 그대로 두고, 볼트 감시·진행 작업도 그대로 돈다.
  // ⌘Q·업데이트 설치 중이면 닫는다(quit-guard).
  // 창이 여러 개면 닫는 창만 닫는다 — 마지막 한 개일 때만 숨긴다.
  mainWindow.on('close', (event) => {
    if (BrowserWindow.getAllWindows().length > 1 || !quitGuard.hidesOnClose()) return
    event.preventDefault()
    // 전체 화면이면 먼저 나온 뒤 숨긴다 — 전체 화면 Space 째 숨기지 않게
    if (mainWindow.isFullScreen()) {
      mainWindow.once('leave-full-screen', () => mainWindow.hide())
      mainWindow.setFullScreen(false)
    } else mainWindow.hide()
  })
  // 닫힌 창은 바인딩을 풀고, 아무도 안 보는 보관함 감시는 멈춘다
  mainWindow.on('closed', () => {
    const dir = bindings.dirFor(id)
    bindings.unbind(id)
    if (dir) releaseVaultWatch(dir)
  })
  // 저장 안 한 글이 닫기를 막았다 — 종료가 취소됐다. 숨긴 창이면 확인 창이 보이게 꺼낸다
  mainWindow.webContents.on('will-prevent-unload', () => {
    if (quitGuard.quitBlocked() === 'update') updateInstallStopped()
    if (!mainWindow.isVisible()) mainWindow.show()
  })

  // 화면(렌더러)이 죽으면 빈 창만 남는다 — 다시 열기·진단 정보 내보내기·창 닫기를 고르게 한다. 기록은 로거의 render-process-gone 이 남긴다
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || mainWindow.isDestroyed()) return
    void askAfterRendererGone(mainWindow)
  })

  // 외부 링크는 기본 브라우저로 연다 — http·https·mailto만, 그 밖 스킴은 앱 안에서 죽인다
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^(https?:|mailto:)/i.test(details.url)) {
      void shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  // target 없는 <a href>가 앱 창을 외부 페이지로 바꾸지 않게 차단한다
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  // ⌘W(Ctrl+W)는 탭 닫기 — 기본 메뉴의 창 닫기로 새기 전에 가로챈다.
  // Dock·메뉴 닫기(숨기기)와 ⌘Q 종료는 건드리지 않는다
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isCloseTabKey(input, process.platform)) {
      event.preventDefault()
      mainWindow.webContents.send(APP_CHANNELS.closeCurrentTab)
    }
    // 배포본은 watchWindowShortcuts 가 DevTools 단축키를 막는다 — 개발자 모드면 main 이 직접 연다
    if (shouldToggleDevTools(developerMode(), input, process.platform)) {
      event.preventDefault()
      mainWindow.webContents.toggleDevTools()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return mainWindow
}

// vault:// 는 standard·secure·supportFetchAPI 스킴으로 등록 — app ready 전에 해야 한다.
// stream 은 소리·영상용 — 부분 응답(206)을 흘려보내는 권한이다(electron.d.ts `stream?: boolean`, 기본 false).
// 실제 206 왕복은 e2e 가 확인한다(`e2e/sources.spec.ts` 미디어 테스트)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vault',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

// e2e 격리: 테스트가 임시 userData 를 넘기면 사용자의 실제 settings.json 을 건드리지 않는다.
// app.setPath 로 덮어쓴다(electron.d.ts setPath: 없는 디렉터리면 Error).
const userDataOverride = process.env['SECOND_BRAIN_USER_DATA']
if (userDataOverride) app.setPath('userData', userDataOverride)
// 배포본 기록 — userData 가 정해진 뒤, IPC 핸들러를 등록하기 전에(소요시간 감싸기)
installLogger()
loadDeveloperMode()

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.lemoncloud.2nd-brain-desktop')
  // macOS 기본 메뉴의 창 닫기(⌘W)가 탭 닫기를 가로채기 전에 뺀다 — Edit·종료는 기본 그대로
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(process.platform)))
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('before-quit', () => {
    quitGuard.quitStarted()
  })

  registerAppHandlers()
  registerVaultHandlers()
  registerClipHandlers()
  registerWebHandlers()
  registerIngestHandlers()
  registerChatHandlers()
  registerReviewHandlers()
  registerWikiHandlers()
  registerSearchHandlers()
  registerReviewItemHandlers()
  registerSyncHandlers()
  registerGithubHandlers()
  registerUpdateHandlers()
  registerDiagnosticsHandlers()

  // 보관함 새 창 열기 — 고른 폴더를 그대로 새 창에 묶는다(전역 설정·전환 없음)
  setWindowOpener((dir) => {
    createWindow({ vaultDir: dir })
  })

  // vault:// — 리더 이미지·Sources 미리보기 바이트 경로. 같은 resolveInVault 검사를 거친다.
  // 앞에 있는 창의 보관함부터 찾는다 — 두 보관함에 같은 경로가 있으면 앞 창 것을 보인다.
  // 파일 검사는 handleVaultRequestFor 가 보관함마다 한다(없으면 404로 다음 보관함)
  protocol.handle('vault', (request) => {
    const url = new URL(request.url)
    const focused = BrowserWindow.getFocusedWindow()
    const ordered = orderedVaultDirs(
      focused && !focused.isDestroyed() ? bindings.dirFor(focused.webContents.id) : null,
      currentVaultDir(),
      bindings.dirs()
    )
    if (ordered.length === 0) return new Response('forbidden', { status: 403 })
    // `?preview` = 워드·파워포인트를 HTML 로 바꿔 내주는 길(비동기)
    if (url.searchParams.has('preview')) return handleVaultPreviewFor(ordered, url)
    return handleVaultRequestFor(ordered, url, request.headers.get('range'))
  })
  // 볼트 활동 변화를 그 보관함을 연 창에 푸시한다 — Activity 패널의 진행 점이 이 값을 읽는다
  const pushActivity = (): void => {
    const dirs = new Set(bindings.dirs())
    const global = currentVaultDir()
    if (global) dirs.add(global)
    for (const dir of dirs) sendToVault(dir, APP_CHANNELS.activityChanged, isIngestRunning(dir))
  }
  vaultActivity.onChange(pushActivity)
  // 활동이 끝났으면 쉬고 있는 감시의 적립된 볼트 변경을 1회 푸시한다
  vaultActivity.onChange(() => {
    releaseIdleWatchers()
  })
  // 지난번에 노트를 쓰다 꺼졌으면 받기보다 먼저 마무리한다 — 반쯤 쓴 파일이 저장 커밋에 섞이지 않게
  recoverNoteRuns(currentVaultDir())
  // 앱 시작 — 비개발자가 "받기" 를 기억할 필요가 없게 여기서 이미 받아 둔다. 실패해도 창은 뜬다
  void runSync()
  // 그 뒤로는 살펴보기만 한다 — 팀에 새 변경이 있으면 상태 줄이 알리고, 받기는 사람이 누른다
  watchTeam()
  // 첫 창은 전역 보관함에 묶이고 감시도 든다
  createWindow()

  app.on('activate', function () {
    // 닫아 숨긴 창을 그대로 꺼낸다 — 탭·채팅·쓰던 글이 닫기 전 그대로다
    const hidden = BrowserWindow.getAllWindows()[0]
    if (hidden) {
      if (hidden.isMinimized()) hidden.restore()
      hidden.show()
      return
    }
    // 창이 없으면(버리기 뒤 닫기 등) 새로 띄운다 — 첫 창이라 전역 보관함에 묶이고 감시도 든다
    createWindow()
  })
})

app.on('window-all-closed', () => {
  stopAllWatches()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
