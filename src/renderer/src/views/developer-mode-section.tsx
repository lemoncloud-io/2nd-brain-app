import { useCallback, useEffect, useState } from 'react'
import type { DiagnosticsState, ProcessMetricRow } from '../../../shared/ipc-contract'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { ErrorNote } from '../components/error-note'
import { fileName } from '../hooks/use-export-diagnostics'
import { formatElapsed } from '../lib/elapsed'
import { getT, useT } from '../lib/i18n'
import { toUserError, type UserError } from '../lib/user-error'

/** 실패를 화면 오류로 — what 은 부를 때 사전을 읽는다(언어를 바꿔도 맞게) */
const failWith =
  (setError: (error: UserError) => void, what: () => string) =>
  (err: unknown): void =>
    setError(toUserError(err, what()))

const OFF: DiagnosticsState = { developerMode: false, traceStartedAt: null }

// 설정 → 고급 → 문제 해결 → 개발자 모드 — 켜면 상세 기록·DevTools·프로세스 사용량·성능 기록.
// 손잡이는 켜졌을 때만 보인다. 꺼져 있으면 main 도 같은 IPC 를 거절한다(렌더러 숨김만 믿지 않는다)
const DeveloperModeSection = (): React.JSX.Element => {
  const t = useT()
  const [state, setState] = useState<DiagnosticsState | null>(null)
  const [metrics, setMetrics] = useState<ProcessMetricRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [traceSaved, setTraceSaved] = useState<string | null>(null)
  const [error, setError] = useState<UserError | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    window.api
      .getDiagnosticsState()
      .then(setState)
      .catch((err: unknown) => {
        // 못 읽었으면 꺼진 것으로 보이고 이유를 알린다 — 스위치가 잠긴 채 남지 않게(켜기는 main 이 다시 본다)
        setState(OFF)
        failWith(setError, () => getT().diagnostics.stateFailed)(err)
      })
  }, [])

  const refresh = useCallback((): void => {
    window.api
      .getProcessMetrics()
      .then(setMetrics)
      .catch((err: unknown) => {
        // 옛 숫자를 지금 것처럼 두지 않는다
        setMetrics(null)
        failWith(setError, () => getT().diagnostics.metricsFailed)(err)
      })
  }, [])

  const on = state?.developerMode === true
  useEffect(() => {
    if (on) refresh()
  }, [on, refresh])

  // 기록 중에는 경과 시간을 1초마다 다시 그린다
  const recordingSince = state?.traceStartedAt ?? null
  useEffect(() => {
    if (recordingSince === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [recordingSince])

  /**
   * 한 번에 하나 — 끝나면 성공이든 실패든 main 상태를 다시 읽어 버튼을 맞춘다(실패해도 main 은 기록을 닫았을 수 있다).
   * 다시 읽기가 실패해도 이 일의 결과(오류·저장 알림)를 덮지 않는다
   */
  const run = (task: () => Promise<void>, what: () => string): void => {
    setError(null)
    setBusy(true)
    task()
      .catch(failWith(setError, what))
      .finally(() => {
        setBusy(false)
        window.api
          .getDiagnosticsState()
          .then(setState)
          .catch(() => undefined)
      })
  }

  const toggle = (next: boolean): void =>
    run(
      () =>
        window.api.setDeveloperMode(next).then((saved) => {
          setState(saved)
          // 끄면서 닫은 기록 — 손잡이는 사라져도 저장 알림은 남긴다
          if (saved.savedTrace) setTraceSaved(fileName(saved.savedTrace))
        }),
      () => getT().diagnostics.developerModeFailed
    )

  const startTrace = (): void => {
    setTraceSaved(null)
    run(
      () => window.api.startTrace().then(setState),
      () => getT().diagnostics.traceFailed
    )
  }

  const stopTrace = (): void =>
    run(
      () => window.api.stopTrace().then((path) => setTraceSaved(fileName(path))),
      () => getT().diagnostics.traceFailed
    )

  const traceNote =
    recordingSince !== null
      ? t.diagnostics.traceRecording(
          formatElapsed(Math.max(0, Math.floor((now - recordingSince) / 1000)))
        )
      : traceSaved && t.diagnostics.exportDone(traceSaved)

  return (
    <div data-testid="developer-mode-section">
      <label className="flex cursor-pointer items-start gap-2">
        <Checkbox
          className="mt-0.5"
          checked={on}
          disabled={state === null || busy}
          data-testid="diagnostics-developer-mode"
          onCheckedChange={(next) => toggle(next === true)}
        />
        <span className="min-w-0">
          <span className="block text-callout text-foreground">{t.diagnostics.developerMode}</span>
          <span className="block text-caption text-muted-foreground">
            {t.diagnostics.developerModeHint}
          </span>
        </span>
      </label>
      {on && (
        <div className="mt-3 flex flex-col gap-3 pl-6">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              data-testid="diagnostics-devtools"
              onClick={() =>
                run(
                  () => window.api.openDevTools(),
                  () => getT().diagnostics.devToolsFailed
                )
              }
            >
              {t.diagnostics.openDevTools}
            </Button>
            {recordingSince === null ? (
              <Button
                size="sm"
                variant="outline"
                data-testid="diagnostics-trace-start"
                disabled={busy}
                onClick={startTrace}
              >
                {t.diagnostics.traceStart}
              </Button>
            ) : (
              <Button
                size="sm"
                data-testid="diagnostics-trace-stop"
                disabled={busy}
                onClick={stopTrace}
              >
                {t.diagnostics.traceStop}
              </Button>
            )}
          </div>
          <p className="text-caption text-muted-foreground">{t.diagnostics.traceHint}</p>
          <div>
            <div className="flex items-center justify-between">
              <p className="text-callout text-foreground">{t.diagnostics.processes}</p>
              <Button
                size="sm"
                variant="ghost"
                data-testid="diagnostics-metrics-refresh"
                onClick={refresh}
              >
                {t.diagnostics.refresh}
              </Button>
            </div>
            {on && metrics && (
              <table
                className="mt-1 w-full border-collapse text-caption tabular-nums"
                data-testid="diagnostics-metrics"
              >
                <thead className="text-muted-foreground">
                  <tr className="border-b border-hairline text-left">
                    <th className="py-1 pr-2 font-normal">{t.diagnostics.colType}</th>
                    <th className="py-1 pr-2 font-normal">{t.diagnostics.colName}</th>
                    <th className="py-1 pr-2 text-right font-normal">PID</th>
                    <th className="py-1 pr-2 text-right font-normal">{t.diagnostics.colCpu}</th>
                    <th className="py-1 text-right font-normal">{t.diagnostics.colMemory}</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((row) => (
                    <tr key={row.pid} className="border-b border-hairline last:border-b-0">
                      <td className="py-1 pr-2">{row.type}</td>
                      <td className="max-w-40 truncate py-1 pr-2" title={row.name}>
                        {row.name}
                      </td>
                      <td className="py-1 pr-2 text-right">{row.pid}</td>
                      <td className="py-1 pr-2 text-right">{row.cpuPercent}%</td>
                      <td className="py-1 text-right">{t.diagnostics.memoryMB(row.memoryMB)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {/* 알림 칸은 늘 두고 글만 바꾼다 — 글과 함께 생긴 칸은 보조기기가 읽지 않을 수 있다. 끄면서 닫은 기록도 여기 알린다 */}
      <p
        role="status"
        className="mt-2 text-caption text-muted-foreground empty:hidden"
        data-testid="diagnostics-trace-note"
      >
        {traceNote}
      </p>
      {error && <ErrorNote error={error} testId="developer-mode-failed" className="mt-2" />}
    </div>
  )
}

export default DeveloperModeSection
