// 성능 — 프로세스별 CPU·메모리 요약과 오래된 성능 기록(trace) 고르기. Electron 을 부르는 쪽은 ipc/diagnostics-handlers.ts
import type { TraceConfig } from 'electron'
import type { ProcessMetricRow } from '../../shared/ipc-contract'

/** app.getAppMetrics() 한 항목 중 쓰는 칸 — 테스트가 Electron 없이 만든다 */
export interface MetricInput {
  pid: number
  type: string
  name?: string
  serviceName?: string
  cpu: { percentCPUUsage?: number }
  memory: { workingSetSize?: number }
}

/** 메모리 큰 순 — 어느 프로세스가 무거운지 맨 위에서 본다. workingSetSize 는 KB */
export const summarizeMetrics = (metrics: MetricInput[]): ProcessMetricRow[] =>
  metrics
    .map((m) => ({
      pid: m.pid,
      type: m.type,
      name: m.name ?? m.serviceName ?? '',
      cpuPercent: Math.round((m.cpu.percentCPUUsage ?? 0) * 10) / 10,
      memoryMB: Math.round((m.memory.workingSetSize ?? 0) / 1024)
    }))
    .sort((a, b) => b.memoryMB - a.memoryMB)

/**
 * 성능 기록 설정 — DevTools Performance 패널이 읽는 카테고리(화면 프레임·JS 샘플·사용자 타이밍·로딩·입력 지연)와
 * main 의 동기 파일 I/O 만. '*' 는 15초에 110MB 남짓을 쓰고, 기록을 이어 켜면 Tracing Service 가 250MB 넘게 쥔 채 돈다.
 * 버퍼는 32MB 고리 — 길게 켜 두면 오래된 것부터 버리고 멈추기 직전 동작이 남는다
 */
export const TRACE_CONFIG: TraceConfig = {
  included_categories: [
    'devtools.timeline',
    'disabled-by-default-devtools.timeline',
    'disabled-by-default-devtools.timeline.frame',
    'disabled-by-default-devtools.timeline.stack',
    'disabled-by-default-v8.cpu_profiler',
    'v8.execute',
    'blink.user_timing',
    'loading',
    'latencyInfo',
    'toplevel',
    'node.fs.sync'
  ],
  recording_mode: 'record-continuously',
  trace_buffer_size_in_kb: 32 * 1024
}

/** 성능 기록 파일 이름 — 진단 기록 폴더에 `trace-<시각>.json` */
export const TRACE_FILE = /^trace-.*\.json$/

/** 성능 기록 파일 이름 — 이름은 초 단위라 같은 초에 두 번 멈추면 `-2`… 를 붙여 앞 기록을 덮지 않는다 */
export const traceFileName = (stamp: string, taken: (name: string) => boolean): string => {
  let name = `trace-${stamp}.json`
  for (let n = 2; taken(name); n += 1) name = `trace-${stamp}-${n}.json`
  return name
}

/** 진단 기록 폴더에 남기는 성능 기록 수 — 한 번에 수십 MB 라 쌓이면 디스크를 채운다 */
export const TRACE_KEEP = 3

/** 지울 성능 기록 — 최근 keep 개를 뺀 나머지. 다른 파일은 보지 않는다 */
export const tracesToPrune = (
  files: { name: string; mtimeMs: number }[],
  keep = TRACE_KEEP
): string[] =>
  files
    .filter((f) => TRACE_FILE.test(f.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(keep)
    .map((f) => f.name)
