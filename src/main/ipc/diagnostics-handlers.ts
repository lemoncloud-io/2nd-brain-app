// 문제 해결 — 렌더러 오류 수집, 진단 기록 폴더 열기, 진단 정보 내보내기, 개발자 모드(DevTools·프로세스·성능 기록).
import {
  app,
  BrowserWindow,
  contentTracing,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { release } from 'node:os'
import { basename, join } from 'node:path'
import { APP_CHANNELS, type DiagnosticsState } from '../../shared/ipc-contract'
import { droppedLogLines, flushLogs, log, logFiles, logsDir } from '../diagnostics/install'
import { createReportGate, normalizeReport } from '../diagnostics/renderer-report'
import { buildDiagnosticsZip, pickDiagnosticSettings } from '../diagnostics/bundle'
import { developerMode, setDeveloperMode } from '../diagnostics/developer-mode'
import { isMissing } from '../diagnostics/log-file'
import {
  summarizeMetrics,
  TRACE_CONFIG,
  TRACE_FILE,
  traceFileName,
  tracesToPrune
} from '../diagnostics/profiling'
import { loadSettings } from '../settings'
import { mainT } from '../i18n'

/** 렌더러 오류 루프가 기록을 채우지 않게 — 10초에 50건, 버린 수는 창이 끝날 때 한 줄 */
const reportGate = createReportGate({
  max: 50,
  windowMs: 10_000,
  onSuppressed: (count) => log().warn('renderer', `${count} reports suppressed`)
})

/** 기록 대기열을 비우는 데 이만큼만 기다린다 — 쓰기가 멈춰도 내보내기는 끝난다 */
const FLUSH_WAIT_MS = 2000

/**
 * 앱 창의 맨 위 프레임만 — 웹 탭(preload 없음)·미리보기 iframe(sandbox)은 지금도 닿지 못하지만,
 * 그 전제가 바뀌어도 기록 채널이 열리지 않게 한 번 더 본다
 */
const fromAppWindow = (event: IpcMainInvokeEvent): boolean =>
  event.senderFrame === event.sender.mainFrame &&
  BrowserWindow.fromWebContents(event.sender) !== null

/** 진단 기록 폴더를 연다 — 아직 한 줄도 안 썼어도 폴더는 있게 만든다. 실패면 원문 */
export const openLogsFolder = async (): Promise<string> => {
  let failed: string
  try {
    const dir = logsDir()
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    failed = await shell.openPath(dir)
  } catch (error) {
    failed = String(error)
  }
  if (failed) log().warn('main', 'open logs folder failed', failed)
  return failed
}

/** 파일 이름용 지역 시각 `20261024-131500` — 정렬되고 경로에 못 쓰는 글자가 없다 */
const stamp = (now: Date): string => {
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`
}

/** 기록 파일을 하나씩 읽는다 — 회전 중 사라진 파일은 건너뛰고, 못 읽은 파일은 이유를 남기고 나머지로 묶는다 */
const readLogs = (): {
  logs: { name: string; bytes: Uint8Array }[]
  unreadable: { name: string; error: string }[]
} => {
  const logs: { name: string; bytes: Uint8Array }[] = []
  const unreadable: { name: string; error: string }[] = []
  for (const file of logFiles()) {
    try {
      logs.push({ name: basename(file), bytes: readFileSync(file) })
    } catch (error) {
      if (!isMissing(error)) unreadable.push({ name: basename(file), error: String(error) })
    }
  }
  return { logs, unreadable }
}

const collectBundle = async (): Promise<Uint8Array> => {
  // 대기 중인 줄까지 파일에 닿은 뒤 읽는다 — 방금 난 오류가 묶음에서 빠지지 않게
  await Promise.race([flushLogs(), new Promise((done) => setTimeout(done, FLUSH_WAIT_MS))])
  const home = app.getPath('home')
  const { logs, unreadable } = readLogs()
  const userData = app.getPath('userData')
  const settingsExisted = existsSync(join(userData, 'settings.json'))
  const settings = loadSettings(userData)
  const vaults = [
    settings.vaultDir,
    ...(Array.isArray(settings.recentVaultDirs) ? settings.recentVaultDirs : [])
  ]
  const info = {
    generatedAt: new Date().toISOString(),
    app: {
      version: app.getVersion(),
      packaged: app.isPackaged,
      locale: app.getLocale(),
      uptimeSeconds: Math.round(process.uptime())
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      osRelease: release(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    },
    // settings.json 이 있는데 못 읽었으면 그 사실을 남긴다 — 그것이 문제의 원인일 수 있다
    settings:
      settingsExisted && Object.keys(settings).length === 0
        ? { error: 'settings.json unreadable' }
        : pickDiagnosticSettings(settings, home),
    logs: logs.map(({ name, bytes }) => ({ name, bytes: bytes.length })),
    logsUnreadable: unreadable,
    // 기록 파일이 쉬는 동안(디스크 가득·잠김) 버린 줄 — 0 이 아니면 최근 기록이 비어 있다
    logsDropped: droppedLogLines(),
    developerMode: developerMode()
  }
  return buildDiagnosticsZip({
    logs,
    info,
    home,
    vaults: vaults.filter((dir): dir is string => typeof dir === 'string')
  })
}

/** 한 번에 하나 — 두 곳(설정·복구 화면·창 대화상자)에서 눌러도 대화상자가 겹쳐 뜨지 않는다 */
let exporting: Promise<string | null> | null = null

const runExport = async (win?: BrowserWindow): Promise<string | null> => {
  const t = mainT().diagnostics
  const options = {
    title: t.exportTitle,
    defaultPath: join(app.getPath('downloads'), t.exportFileName(stamp(new Date()))),
    filters: [{ name: 'zip', extensions: ['zip'] }]
  }
  const picked = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  if (picked.canceled || !picked.filePath) return null
  // 옆 이름에 다 쓴 뒤 바꾼다 — 쓰다 실패해도 사용자가 고른 자리에 반쪽 파일이 남지 않는다
  const partial = `${picked.filePath}.partial`
  try {
    writeFileSync(partial, await collectBundle(), { mode: 0o600 })
    renameSync(partial, picked.filePath)
  } catch (error) {
    rmSync(partial, { force: true })
    throw error
  }
  log().info('main', 'diagnostics exported', picked.filePath)
  return picked.filePath
}

/**
 * 진단 정보를 사용자가 고른 곳에 zip 으로 쓴다 — 저장한 경로, 취소면 null. 쓰기 실패는 던진다.
 * 대화상자는 부를 때 속성으로 읽는다 — e2e 가 고정한다
 */
export const exportDiagnostics = (win?: BrowserWindow): Promise<string | null> => {
  exporting ??= runExport(win).finally(() => {
    exporting = null
  })
  return exporting
}

/** 기록 중이면 시작 시각 — main 이 한 곳에서 쥔다(창이 여럿이어도 기록은 하나) */
let traceStartedAt: number | null = null
/** 시작·멈춤이 도는 중 — 끝나기 전에 다른 쪽(다른 창·끄기·자동 멈춤)이 상태를 읽고 엇갈리지 않게 */
let traceOp: Promise<unknown> | null = null
let traceTimer: NodeJS.Timeout | null = null
/** 이만큼 지나면 저절로 멈춘다 — 켜 둔 걸 잊어도 기록이 디스크·메모리를 채우지 않게 */
const TRACE_MAX_MS = 5 * 60_000

const diagnosticsState = (): DiagnosticsState => ({
  developerMode: developerMode(),
  traceStartedAt
})

/** 개발자 손잡이는 main 이 다시 본다 — 렌더러가 버튼을 숨긴 것만 믿지 않는다 */
const requireDeveloper = (event: IpcMainInvokeEvent): BrowserWindow => {
  const win = fromAppWindow(event) ? BrowserWindow.fromWebContents(event.sender) : null
  if (!win || !developerMode()) throw new Error('developer mode is off')
  return win
}

/** 시작·멈춤은 한 번에 하나 */
const serialTrace = <T>(task: () => Promise<T>): Promise<T> => {
  if (traceOp) return Promise.reject(new Error('trace start or stop in progress'))
  const op = task().finally(() => {
    traceOp = null
  })
  traceOp = op
  return op
}

/** 최근 TRACE_KEEP 개만 남긴다 — 한 번에 수십 MB 다 */
const pruneTraces = (dir: string): void => {
  try {
    const files = readdirSync(dir)
      .filter((name) => TRACE_FILE.test(name))
      .map((name) => ({ name, mtimeMs: statSync(join(dir, name)).mtimeMs }))
    for (const name of tracesToPrune(files)) rmSync(join(dir, name), { force: true })
  } catch (error) {
    log().warn('main', 'old traces not pruned', error)
  }
}

const beginTrace = (): Promise<DiagnosticsState> =>
  serialTrace(async () => {
    if (traceStartedAt !== null) throw new Error('already recording')
    await contentTracing.startRecording(TRACE_CONFIG)
    traceStartedAt = Date.now()
    traceTimer = setTimeout(() => {
      endTrace().catch((error: unknown) => log().warn('main', 'trace auto stop failed', error))
    }, TRACE_MAX_MS)
    log().info('main', 'trace started')
    return diagnosticsState()
  })

/** 기록을 멈추고 진단 기록 폴더에 쓴다 — 쓴 경로. 폴더를 못 만들어도 기록은 닫는다(경로 없이 멈추면 임시 폴더에 쓴다) */
const endTrace = (): Promise<string> =>
  serialTrace(async () => {
    const started = traceStartedAt
    if (started === null) throw new Error('not recording')
    if (traceTimer) clearTimeout(traceTimer)
    traceTimer = null
    try {
      const dir = logsDir()
      let target: string | undefined
      try {
        mkdirSync(dir, { recursive: true, mode: 0o700 })
        target = join(
          dir,
          traceFileName(stamp(new Date()), (name) => existsSync(join(dir, name)))
        )
      } catch (error) {
        log().warn('main', 'logs folder unavailable for trace', error)
      }
      const path = await contentTracing.stopRecording(target)
      log().info('main', 'trace saved', path, `${Math.round((Date.now() - started) / 1000)}s`)
      if (target) pruneTraces(dir)
      return path
    } finally {
      traceStartedAt = null
    }
  })

/** 켜기 전에 main 이 묻는다 — 남이 시킨 코드를 개발자 도구에 붙여 넣으면 보관함·계정이 넘어갈 수 있다 */
const confirmDeveloperMode = async (win: BrowserWindow | null): Promise<boolean> => {
  const t = mainT().diagnostics
  const options = {
    type: 'warning' as const,
    message: t.developerModeConfirmTitle,
    detail: t.developerModeConfirmDetail,
    buttons: [t.developerModeConfirm, t.cancel],
    defaultId: 1,
    cancelId: 1
  }
  const { response } = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options)
  return response === 0
}

export const registerDiagnosticsHandlers = (): void => {
  // renderer 입력 — 모양을 거르고 길이·줄바꿈을 다듬는다. 가림은 로거가 한다
  ipcMain.handle(APP_CHANNELS.reportError, (event, raw: unknown) => {
    if (!fromAppWindow(event) || !reportGate.take()) return
    const report = normalizeReport(raw)
    if (!report) {
      log().warn('renderer', 'malformed report dropped')
      return
    }
    log()[report.level]('renderer', report.message, ...(report.stack ? [report.stack] : []))
  })
  ipcMain.handle(APP_CHANNELS.openLogsFolder, (event) => {
    if (!fromAppWindow(event)) throw new Error('not allowed')
    return openLogsFolder()
  })
  ipcMain.handle(APP_CHANNELS.exportDiagnostics, (event) => {
    if (!fromAppWindow(event)) throw new Error('not allowed')
    return exportDiagnostics(BrowserWindow.fromWebContents(event.sender) ?? undefined)
  })
  ipcMain.handle(APP_CHANNELS.getDiagnosticsState, () => diagnosticsState())
  ipcMain.handle(APP_CHANNELS.setDeveloperMode, async (event, on: unknown) => {
    if (!fromAppWindow(event)) throw new Error('not allowed')
    const next = on === true
    if (next && !developerMode()) {
      if (!(await confirmDeveloperMode(BrowserWindow.fromWebContents(event.sender)))) {
        return diagnosticsState()
      }
    }
    let savedTrace: string | undefined
    if (!next) {
      if (traceOp) await traceOp.catch(() => undefined)
      // 끄면 성능 손잡이가 사라진다 — 돌던 기록을 먼저 닫는다. 못 닫으면 켠 채로 두고 던진다(꺼진 채 기록이 남지 않게)
      if (traceStartedAt !== null) savedTrace = await endTrace()
    }
    setDeveloperMode(next)
    return { ...diagnosticsState(), ...(savedTrace && { savedTrace }) }
  })
  ipcMain.handle(APP_CHANNELS.openDevTools, (event) => {
    requireDeveloper(event).webContents.openDevTools({ mode: 'detach' })
  })
  ipcMain.handle(APP_CHANNELS.getProcessMetrics, (event) => {
    requireDeveloper(event)
    return summarizeMetrics(app.getAppMetrics())
  })
  ipcMain.handle(APP_CHANNELS.startTrace, (event) => {
    requireDeveloper(event)
    return beginTrace()
  })
  ipcMain.handle(APP_CHANNELS.stopTrace, (event) => {
    requireDeveloper(event)
    return endTrace()
  })
}
