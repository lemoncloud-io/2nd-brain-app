import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, LoaderCircle, Sparkles } from 'lucide-react'
import type { EngineEvent, IngestOutcome } from '../../../shared/ipc-contract'
import { EmptyState } from '../components/layout/view'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'
import { describeEvents, splitIngestLog, type LogLine } from '../lib/engine-log'
import { runLabel } from '../lib/ingest-run'
import { useWorkbench } from '../store/workbench'
import { useSidecarFocus } from '../hooks/use-sidecar-focus'
import { useSetup } from '../hooks/use-setup'
import { useElapsed } from '../hooks/use-elapsed'
import { toUserError } from '../lib/user-error'
import { formatElapsed } from '../lib/elapsed'
import { waitingClippings } from '../lib/clippings'
import { WaitingClippings } from '../components/waiting-clippings'
import { getT, useT } from '../lib/i18n'

const LINE_TONE: Record<LogLine['kind'], string> = {
  text: 'text-callout text-foreground',
  thinking: 'text-caption text-muted-foreground',
  phase: 'text-caption font-semibold text-label',
  step: 'text-caption text-label',
  error: 'text-caption text-destructive',
  done: 'text-caption font-semibold text-label'
}

/** detail 은 사용자 말. 브랜치 같은 작업 이름은 화면에 올리지 않는다 */
type Outcome = { text: string; detail?: string; ok: boolean; syncNeeded?: boolean }

// 취소·실패 사유는 main 이 이미 문장으로 준다 — 앞에 "취소:"·"실패:" 를 또 붙이지 않는다
const toOutcome = (outcome: IngestOutcome): Outcome =>
  outcome.status === 'succeeded'
    ? {
        text: getT().sources.ingest.succeeded,
        detail: runLabel(outcome.branch),
        ok: true
      }
    : outcome.status === 'sync-needed'
      ? {
          text: getT().sources.ingest.syncNeeded(outcome.reason),
          ok: false,
          syncNeeded: true
        }
      : { text: outcome.reason, ok: false }

type IngestSectionProps = {
  onOpenReview: () => void
  onRunningChange: (running: boolean) => void
}

// 작업 패널 위키화 탭 — 설명과 실행·취소 → 결과 카드 → 이벤트 기록.
export const IngestSection = ({
  onOpenReview,
  onRunningChange
}: IngestSectionProps): React.JSX.Element => {
  const t = useT()
  const [events, setEvents] = useState<EngineEvent[]>([])
  const [running, setRunning] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [canceling, setCanceling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const elapsed = useElapsed(running)
  const [vaultDir, setVaultDir] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const setup = useSetup()
  const { journey } = setup
  // 무엇이 들어갈지 — 트리가 이미 들고 있는 `Clippings/` 를 쓴다. 트리를 못 읽었을 때만 main 이 센 수로 말한다
  const tree = useWorkbench((s) => s.tree)
  const waiting = useMemo(() => (tree === null ? null : waitingClippings(tree)), [tree])
  const clippings = waiting?.length ?? journey?.clippings ?? null
  const setView = useWorkbench((s) => s.setView)
  const openKnowledge = useWorkbench((s) => s.openKnowledge)
  const openSources = (): void =>
    setup.vault === 'ok' ? openKnowledge('sources') : setView('start')
  // 줄 이름은 사전에서 온다 — 언어가 바뀌면 이미 받은 이벤트도 다시 쓴다
  const lines = useMemo(() => describeEvents(events, vaultDir, t), [events, vaultDir, t])
  const log = useMemo(() => splitIngestLog(lines), [lines])
  // 진행 수는 main 이 센 것 — 초안 호출은 도구 없이 돌아 읽기·쓰기 이벤트로는 셀 수 없다
  const progress = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i]!
      if (event.type === 'phase' && event.progress) return event.progress
    }
    return null
  }, [events])

  useEffect(() => {
    const load = (): void => {
      window.api
        .getVaultStatus()
        .then((status) => setVaultDir(status.vaultDir))
        .catch(console.error)
    }
    load()
    return window.api.onWikiChanged((rels) => {
      if (rels.length === 0) load()
    })
  }, [])

  useEffect(() => window.api.onIngestEvent((event) => setEvents((prev) => [...prev, event])), [])

  useEffect(() => onRunningChange(running), [running, onRunningChange])

  // 밖(자료 화면)에서 위키 초안 탭으로 오면 머리글에 초점이 따라간다 — 칸 안 이동은 조용하다
  const headRef = useRef<HTMLDivElement>(null)
  useSidecarFocus('ingest', headRef)

  // 새 이벤트가 오면 기록 끝으로 따라간다
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [events.length])

  // 시작하기의 "위키 초안 만들기" — runningRef 가 진입 가드다. setRunning 뒤 effect 가
  // ref 를 따라가기 전 같은 틱에 또 와도 한 번만 돈다
  const runningRef = useRef(running)
  useEffect(() => {
    runningRef.current = running
  }, [running])

  const start = useCallback((skipSync = false): void => {
    if (runningRef.current) return
    runningRef.current = true
    setEvents([])
    setOutcome(null)
    setCancelError(null)
    setCanceling(false)
    setRunning(true)
    window.api
      .startIngest(skipSync ? { skipSync: true } : undefined)
      .then((result) => setOutcome(toOutcome(result)))
      .catch((error: unknown) =>
        setOutcome({
          text: toUserError(error, getT().sources.ingest.startFailed).text,
          ok: false
        })
      )
      .finally(() => setRunning(false))
  }, [])

  // 패널 밖에서 온 요청 번호가 바뀌면 시작한다 — 진행 중이면 start 의 가드가 막는다
  useEffect(
    () =>
      useWorkbench.subscribe((state, previous) => {
        if (state.ingestRequest !== previous.ingestRequest && !runningRef.current) start()
      }),
    [start]
  )
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 쉴 때는 할 일 하나(시작), 돌 때는 멈추기 하나 — 둘을 같이 두면 쉬는 동안의 회색 취소가
          "무언가 돌고 있다" 로 읽혔다(2026-09-18 사람 확인) */}
      <div
        ref={headRef}
        tabIndex={-1}
        data-sidecar-title="ingest"
        data-testid="ingest-head"
        className="flex shrink-0 flex-col gap-3 border-b border-hairline px-4 py-4 outline-none"
      >
        {running ? (
          <>
            <div className="flex items-center gap-2" data-testid="ingest-running" role="status">
              <LoaderCircle className="size-4 shrink-0 animate-spin text-primary-ink" aria-hidden />
              <p className="min-w-0 flex-1 text-callout text-foreground">
                {t.sources.ingest.running(formatElapsed(elapsed))}
              </p>
              <Button
                variant="outline"
                size="sm"
                data-testid="ingest-cancel"
                disabled={canceling}
                onClick={() => {
                  setCancelError(null)
                  setCanceling(true)
                  window.api.cancelIngest().catch((error: unknown) => {
                    setCanceling(false)
                    setCancelError(toUserError(error, getT().sources.ingest.cancelFailed).text)
                  })
                }}
              >
                {canceling ? t.sources.ingest.canceling : t.sources.ingest.cancel}
              </Button>
            </div>
            {cancelError && (
              <p role="alert" className="text-caption text-destructive">
                {cancelError}
                {t.sources.ingest.pressAgain}
              </p>
            )}
          </>
        ) : (
          <>
            {/* 끝나면 결과가 맨 위다 — 다음 걸음(승인으로)이 시작 버튼보다 먼저 보인다 */}
            {outcome && (
              <div
                data-testid="ingest-outcome"
                className="rounded-lg border border-hairline bg-elevated p-3 shadow-raised"
              >
                {/* live 영역은 글만 — 단추까지 넣으면 매번 단추 이름까지 읽는다 */}
                <div role="status">
                  <p
                    className={cn(
                      'wrap-anywhere text-callout',
                      outcome.ok ? 'text-label' : 'text-destructive'
                    )}
                  >
                    {outcome.text}
                  </p>
                  {outcome.detail && (
                    <p
                      data-testid="ingest-outcome-run"
                      className="mt-0.5 text-caption text-muted-foreground wrap-anywhere"
                    >
                      {outcome.detail}
                    </p>
                  )}
                </div>
                {outcome.ok ? (
                  <Button size="sm" className="mt-2" onClick={onOpenReview}>
                    {t.sources.ingest.toReview}
                    <ArrowRight aria-hidden />
                  </Button>
                ) : outcome.syncNeeded ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="ingest-proceed-without-sync"
                      onClick={() => start(true)}
                    >
                      {t.sources.ingest.withoutSync}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="ingest-retry-sync"
                      onClick={() => start()}
                    >
                      {t.sources.ingest.retrySync}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => start()}>
                    {t.sources.ingest.retry}
                  </Button>
                )}
              </div>
            )}
            {/* 실패 뒤에는 카드의 "다시 시도" 하나 — 같은 동작 단추를 둘 두지 않는다 */}
            {clippings !== 0 && (outcome === null || outcome.ok) && (
              <>
                {!outcome && (
                  <p className="text-caption text-muted-foreground">
                    {t.sources.ingest.explain(clippings)}
                  </p>
                )}
                {/* 결과가 있으면 시작은 보조 — 주 행동은 결과 카드의 다음 걸음이다 */}
                <Button
                  data-testid="ingest-start"
                  variant={outcome ? 'outline' : 'default'}
                  onClick={() => start()}
                >
                  <Sparkles aria-hidden />
                  {t.sources.ingest.start(clippings)}
                </Button>
              </>
            )}
          </>
        )}
      </div>

      <div
        ref={logRef}
        className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        {progress && (
          <p className="text-caption text-muted-foreground" data-testid="ingest-summary">
            {t.sources.ingest.progress(progress.total, progress.done, progress.pages)}
          </p>
        )}
        {!running && !outcome && events.length === 0 && waiting !== null && waiting.length > 0 && (
          <section>
            <h2 className="mb-1.5 text-caption text-muted-foreground">
              {t.sources.ingest.waiting}
            </h2>
            <WaitingClippings items={waiting} testId="ingest-waiting" />
          </section>
        )}
        {lines.length > 0 ? (
          <>
            <ol
              data-testid="ingest-events"
              className="flex flex-col gap-1.5 border-l border-hairline pl-3 select-text"
            >
              {log.shown.map((line, index) => (
                <li key={index} className={cn('wrap-anywhere', LINE_TONE[line.kind])}>
                  {line.label}
                </li>
              ))}
            </ol>
            {/* 엔진 원문·초안 본문·경로는 접어 둔다 — 평소엔 사람 말만, 도움을 청할 때만 펼친다 */}
            <details data-testid="ingest-raw">
              <summary className="focus-ring cursor-pointer rounded-sm text-caption text-muted-foreground">
                {t.sources.ingest.raw}
              </summary>
              <ul className="mt-1 flex flex-col gap-0.5 border-l border-hairline pl-3 select-text">
                {log.folded.map((raw, index) => (
                  <li
                    key={index}
                    className="wrap-anywhere whitespace-pre-wrap font-mono text-micro text-muted-foreground"
                  >
                    {raw}
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          !running &&
          !outcome &&
          clippings === 0 && (
            <EmptyState
              icon={Sparkles}
              title={t.sources.ingest.emptyTitle}
              description={t.sources.ingest.emptyBody}
              action={{
                label: t.sources.title,
                onClick: openSources,
                testId: 'ingest-empty-sources'
              }}
            />
          )
        )}
      </div>
    </div>
  )
}
