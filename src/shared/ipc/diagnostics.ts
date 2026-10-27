// 문제 해결 — 기록(로그)·진단 정보·개발자 모드. 기록 파일은 main 만 읽고 쓴다 — 렌더러는 오류를 보내기만 한다.
export const APP_CHANNELS_DIAGNOSTICS = {
  reportError: 'diagnostics:report-error',
  openLogsFolder: 'diagnostics:open-logs-folder',
  exportDiagnostics: 'diagnostics:export',
  getDiagnosticsState: 'diagnostics:get-state',
  setDeveloperMode: 'diagnostics:set-developer-mode',
  openDevTools: 'diagnostics:open-devtools',
  getProcessMetrics: 'diagnostics:get-process-metrics',
  startTrace: 'diagnostics:start-trace',
  stopTrace: 'diagnostics:stop-trace'
} as const

/** 렌더러에서 난 오류 한 건 — main 이 거르고 가린 뒤 main.log 에 `[renderer]` 로 남긴다 */
export interface RendererReport {
  level: 'warn' | 'error'
  message: string
  stack?: string
}

/** 개발자 모드와 성능 기록 상태 — 기록 중이면 시작 시각(epoch ms) */
export interface DiagnosticsState {
  developerMode: boolean
  traceStartedAt: number | null
  /** 끄면서 돌던 성능 기록을 닫았으면 그 파일 경로 — 손잡이가 사라지기 전에 알린다 */
  savedTrace?: string
}

/** 프로세스 하나의 CPU·메모리 — 메모리 큰 순으로 온다 */
export interface ProcessMetricRow {
  pid: number
  /** Electron 프로세스 종류(Browser·Tab·GPU·Utility…) — 개발자가 읽는 원문 */
  type: string
  name: string
  cpuPercent: number
  memoryMB: number
}

export interface AppApiDiagnostics {
  reportError(report: RendererReport): Promise<void>
  /** 기록 폴더를 파일 관리자로 연다 — 실패면 원문, 아니면 빈 문자열 */
  openLogsFolder(): Promise<string>
  /** 진단 정보(기록 + 앱·설정 요약 zip)를 저장 대화상자로 고른 곳에 쓴다 — 저장한 경로, 취소면 null. 쓰기 실패는 던진다 */
  exportDiagnostics(): Promise<string | null>
  getDiagnosticsState(): Promise<DiagnosticsState>
  /** 켜면 상세 기록(debug)·DevTools·성능 손잡이가 열린다 — 켜기 전에 main 이 대화상자로 묻고, 취소면 꺼진 상태를 돌려준다.
   *  끌 때 돌던 기록을 못 닫으면 켠 채로 던진다. 저장 실패도 던진다 */
  setDeveloperMode(on: boolean): Promise<DiagnosticsState>
  // 아래는 개발자 모드일 때만 — 꺼져 있으면 main 이 거절한다(던진다)
  openDevTools(): Promise<void>
  getProcessMetrics(): Promise<ProcessMetricRow[]>
  startTrace(): Promise<DiagnosticsState>
  /** 기록을 멈추고 진단 기록 폴더에 쓴다 — 쓴 경로 */
  stopTrace(): Promise<string>
}
