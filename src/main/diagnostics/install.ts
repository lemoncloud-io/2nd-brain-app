// 배포본 진단의 Electron 연결부 — userData/logs/main.log 하나에 main 의 모든 기록을 모은다.
// console 감싸기(기존 호출처 무수정), 프로세스 안전망, IPC 소요시간. 문구는 부를 때 mainT() 로 읽는다.
import { app, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { createLogFile, type LogFile } from './log-file'
import { captureConsole, createLogger, type Logger, type LogSink } from './logger'
import { mcpSecretValues, rememberSecrets } from './redact'
import { loadSettings } from '../settings'
import { mainT } from '../i18n'

const MAX_BYTES = 5 * 1024 * 1024
const KEEP = 3
/** 이보다 오래 걸린 IPC 핸들러는 warn 으로 남긴다 — 사용자 대화상자를 기다리는 핸들러도 걸린다 */
const SLOW_IPC_MS = 1000

let installed: { logger: Logger; file: LogFile } | null = null

// 설치 전에 들어온 줄 — 설치하면 파일 앞머리에 옮겨 쓴다(테스트·이른 import 가 부를 수 있다)
const early: string[] = []
const earlySink: LogSink = {
  write: (line) => early.push(line),
  writeSync: (line) => early.push(line)
}
const earlyLogger = createLogger(earlySink)

/** userData 를 부를 때 읽는다 — e2e 가 whenReady 전에 userData 를 바꾼다 */
export const logsDir = (): string => join(app.getPath('userData'), 'logs')

export const log = (): Logger => installed?.logger ?? earlyLogger

export const logFiles = (): string[] => installed?.file.files() ?? []

export const flushLogs = (): Promise<void> => installed?.file.flush() ?? Promise.resolve()

/** 기록 파일이 쉬는 동안 버린 줄 수 — 진단 정보가 빈 곳을 숨기지 않게 */
export const droppedLogLines = (): number => installed?.file.dropped() ?? 0

/** 설정의 MCP 서버 비밀(redact.ts mcpSecretValues) — 어떤 모양으로 로그에 찍혀도 지운다. 설정을 저장할 때도 부른다 */
export const rememberMcpSecrets = (servers: unknown): void => {
  rememberSecrets(mcpSecretValues(servers))
}

// 기록이 실패해도 원래 일(오류 전파·오류 상자)은 해야 한다
const quietly = (write: () => void): void => {
  try {
    write()
  } catch {
    // 일부러 버린다 — 기록 실패가 오류 처리를 바꾸지 않게
  }
}

// ipcMain.handle 만 감싼다(앱은 handleOnce·on 을 쓰지 않는다). 던진 오류는 그대로 다시 던진다
const wrapIpcHandlers = (logger: Logger): void => {
  const original = ipcMain.handle.bind(ipcMain)
  const wrapped: typeof ipcMain.handle = (channel, listener) =>
    original(channel, async (event, ...args) => {
      const started = performance.now()
      try {
        return await listener(event, ...args)
      } catch (error) {
        quietly(() => logger.error('ipc', channel, error))
        throw error
      } finally {
        const ms = performance.now() - started
        if (ms > SLOW_IPC_MS)
          quietly(() => logger.warn('ipc', `${channel} took ${Math.round(ms)}ms`))
      }
    })
  ipcMain.handle = wrapped
}

const stackOf = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? String(error)) : String(error)

/** 정상 종료는 남기기만, 나머지(crashed·oom·killed…)는 오류 */
const levelOf = (reason: string): 'info' | 'error' => (reason === 'clean-exit' ? 'info' : 'error')

/**
 * 한 번만 — userData override 뒤, IPC 핸들러 등록 전에 부른다.
 * uncaughtException 은 지금까지 Electron 이 오류 상자를 띄우고 계속하던 것과 같은 동작을 유지하고, 기록만 더한다.
 * unhandledRejection 은 지금까지처럼 알리지 않고 기록만 한다
 */
export const installLogger = (): Logger => {
  if (installed) return installed.logger
  const file = createLogFile({
    dir: logsDir(),
    name: 'main',
    maxBytes: MAX_BYTES,
    keep: KEEP,
    // console.error 는 감싸져 있지만 쉬는 동안의 파일은 줄을 받지 않으므로 다시 돌아오지 않는다
    onError: (error) => console.error('log file unavailable', error)
  })
  const logger = createLogger(file, { home: app.getPath('home') })
  installed = { logger, file }
  for (const line of early.splice(0)) file.write(line)
  quietly(() => rememberMcpSecrets(loadSettings(app.getPath('userData')).mcpServers))
  captureConsole(logger)

  process.on('uncaughtException', (error) => {
    quietly(() => logger.fatal('main', 'uncaughtException', error))
    // 핸들러를 달면 Node 가 stderr 에 찍던 것이 사라진다 — 개발 터미널에 그대로 낸다
    quietly(() => process.stderr.write(`Uncaught exception: ${stackOf(error)}\n`))
    // 속성을 부를 때 읽는다 — e2e 가 모달을 고정한다
    quietly(() => dialog.showErrorBox(mainT().diagnostics.uncaughtTitle, stackOf(error)))
  })
  process.on('unhandledRejection', (reason) => {
    quietly(() => logger.error('main', 'unhandledRejection', reason))
    quietly(() => process.stderr.write(`Unhandled rejection: ${stackOf(reason)}\n`))
  })
  // 렌더러(앱 창·웹 탭)는 child-process-gone 에 오지 않는다 — 따로 듣는다
  app.on('render-process-gone', (_event, contents, details) => {
    logger[levelOf(details.reason)](
      'main',
      'render-process-gone',
      details.reason,
      `exit ${details.exitCode}`,
      contents.getURL()
    )
  })
  app.on('child-process-gone', (_event, details) => {
    logger[levelOf(details.reason)](
      'main',
      'child-process-gone',
      details.type,
      details.reason,
      `exit ${details.exitCode}`,
      details.name ?? ''
    )
  })
  // 종료 직전 대기열을 비운다 — 다음 틱이 오지 않는다
  app.on('will-quit', () => {
    file.drainSync()
  })
  wrapIpcHandlers(logger)

  logger.info(
    'main',
    `start 2nd-brain ${app.getVersion()} · ${process.platform} ${process.arch} · electron ${process.versions.electron} · ${app.isPackaged ? 'packaged' : 'dev'}`
  )
  return logger
}
