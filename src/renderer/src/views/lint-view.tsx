// Lint 탭(슬라이스 09) — 구조 점검(orphan·broken-link·no-outlinks) + vault_verify --lane none.
// 결정론만. 의미 점검(AI)은 별도(슬라이스 13). 항목 클릭 시 리더가 해당 줄로.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, CheckCircle2, Loader2, TriangleAlert } from 'lucide-react'
import type { LintFinding, LintReport } from '../../../shared/wiki/lint'

import { cn } from '../lib/utils'
import { EmptyState, ViewBody, ViewHeader } from '../components/layout/view'
import { ErrorNote } from '../components/error-note'
import { toUserError, type UserError } from '../lib/user-error'
import { describeEvents, isCommandLine } from '../lib/engine-log'
import { formatElapsed } from '../lib/elapsed'
import { Button } from '../components/ui/button'
import { useVaultSwitch } from '../hooks/use-vault-switch'
import { useElapsed } from '../hooks/use-elapsed'
import { useWorkbench } from '../store/workbench'
import type { LintKind } from '../../../shared/wiki/lint'
import { readDefect } from '../../../shared/wiki/verify-defect'
import { unresolvedLinks } from '../../../shared/wiki/link-gaps'
import type { EngineEvent, SemanticLintResult } from '../../../shared/ipc-contract'
import { MergeDialog } from './merge-dialog'
import { getT, useT } from '../lib/i18n'

// 이름·설명은 사전(lintView.kinds)에 — 그래프 용어가 아니라 사용자가 겪는 일로 쓴다
const KINDS: LintKind[] = ['orphan', 'broken-link', 'no-outlinks']

const FindingRow = ({ finding }: { finding: LintFinding }): React.JSX.Element => {
  const t = useT()
  const openPeek = useWorkbench((s) => s.openPeek)
  // [[...]] 는 위키 문법이다 — 화면에는 가리키던 이름만 보여 준다
  const label =
    finding.kind === 'broken-link'
      ? t.lintView.brokenLink(finding.target, finding.line)
      : finding.message
  return (
    <button
      type="button"
      onClick={() => {
        openPeek(finding.rel, finding.kind === 'broken-link' ? finding.line : null)
      }}
      className="focus-ring hover:bg-secondary/60 flex min-h-8 w-full items-center gap-2 rounded px-2 py-1.5 text-left"
      data-testid="lint-finding"
    >
      <span className="text-caption text-muted-foreground min-w-0 flex-1 truncate">
        {finding.rel}
      </span>
      <span className="text-caption text-secondary-foreground shrink-0">{label}</span>
    </button>
  )
}

const SeverityBadge = ({ severity }: { severity: string }): React.JSX.Element => {
  const t = useT()
  return (
    <span
      data-testid="lint-severity"
      className={cn(
        'text-caption shrink-0 rounded px-1.5 py-0.5',
        severity === 'high' && 'bg-destructive/10 text-destructive',
        severity === 'medium' && 'bg-primary/10 text-primary-ink',
        severity === 'low' && 'bg-secondary text-secondary-foreground'
      )}
    >
      {t.lintView.ai.severity[severity] ?? t.lintView.ai.severityDefault}
    </span>
  )
}

// AI 점검(슬라이스 13) — 확인(RISK) → 진행(취소 가능) → 결과 3 상태
const AiLintSection = (): React.JSX.Element => {
  const t = useT()
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'running' | 'done'>('idle')
  const [pageCount, setPageCount] = useState(0)
  const [result, setResult] = useState<SemanticLintResult | null>(null)
  const [error, setError] = useState<UserError | null>(null)
  const [events, setEvents] = useState<EngineEvent[]>([])
  const elapsed = useElapsed(phase === 'running')
  const [canceling, setCanceling] = useState(false)
  const runningRef = useRef(false)
  const [merging, setMerging] = useState<[string, string] | null>(null)

  useEffect(() => {
    window.api
      .lintAiPages()
      .then(setPageCount)
      .catch(() => setPageCount(0))
  }, [])

  // 엔진이 무엇을 읽고 있는지 보여 준다 — 스피너만으로는 멈춘 것과 구분되지 않는다
  useEffect(() => window.api.onLintAiEvent((event) => setEvents((prev) => [...prev, event])), [])

  // 보관함이 바뀌면 옛 점검을 버린다 — main 이 전환 때 끊고 늦은 줄은 버린다
  useVaultSwitch(() => {
    runningRef.current = false
    setCanceling(false)
    setEvents([])
    setError(null)
    // 옛 보관함 결과·합치기 대상도 비운다 — 열기·받기가 엉뚱한 보관함을 읽는다
    setResult(null)
    setMerging(null)
    setPhase('idle')
    window.api
      .lintAiPages()
      .then(setPageCount)
      .catch(() => setPageCount(0))
  })

  const readCount = events.filter((e) => e.type === 'tool' && e.name === 'Read').length
  const lastLine = describeEvents(events.slice(-1), null, t).at(-1)

  const start = (): void => {
    runningRef.current = true
    setCanceling(false)
    setError(null)
    setEvents([])
    setPhase('running')
    window.api
      .lintAiRun()
      .then((r) => {
        if (!runningRef.current) return
        runningRef.current = false
        setResult(r)
        setPhase('done')
      })
      .catch((e: unknown) => {
        if (!runningRef.current) return
        runningRef.current = false
        setError(toUserError(e, getT().lintView.ai.failed))
        setPhase('idle')
      })
  }

  return (
    <div className="rounded-lg border border-hairline p-4" data-testid="lint-ai">
      <p className="mb-1 flex items-center gap-2 text-heading">
        <Bot aria-hidden className="size-4 text-muted-foreground" /> {t.lintView.ai.title}
      </p>
      <p className="mb-3 text-caption text-muted-foreground">{t.lintView.ai.intro}</p>
      {phase === 'idle' && (
        <Button
          variant="outline"
          size="sm"
          data-testid="lint-ai-start"
          onClick={() => {
            setPhase('confirm')
          }}
        >
          {t.lintView.ai.run}
        </Button>
      )}
      {error && <ErrorNote error={error} testId="lint-ai-error" className="mt-2" />}
      {phase === 'confirm' && (
        <div className="flex items-center gap-2" data-testid="lint-ai-confirm">
          <span className="text-caption">{t.lintView.ai.confirm(pageCount)}</span>
          <Button variant="default" size="sm" data-testid="lint-ai-go" onClick={start}>
            {t.lintView.ai.start}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="lint-ai-no"
            onClick={() => {
              setPhase('idle')
            }}
          >
            {t.lintView.ai.cancel}
          </Button>
        </div>
      )}
      {phase === 'running' && (
        <div className="flex flex-col gap-1" data-testid="lint-ai-running">
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <span className="text-caption tabular-nums" data-testid="lint-ai-progress">
              {pageCount > 0
                ? t.lintView.ai.reading(Math.min(readCount, pageCount), pageCount)
                : t.lintView.ai.running}{' '}
              · {t.common.passed(formatElapsed(elapsed))}
            </span>
            <Button
              variant="ghost"
              size="sm"
              data-testid="lint-ai-cancel"
              disabled={canceling}
              onClick={() => {
                runningRef.current = false
                setCanceling(true)
                // 취소가 끝나기 전에 다시 누르면 "AI 점검이 이미 진행 중이다" 로 거절된다
                window.api
                  .lintAiCancel()
                  .catch(() => undefined)
                  .finally(() => {
                    setCanceling(false)
                    setPhase('idle')
                  })
              }}
            >
              {canceling ? t.lintView.ai.stopping : t.lintView.ai.stop}
            </Button>
          </div>
          {lastLine && (
            <p className="text-caption text-muted-foreground truncate">
              {lastLine.label}
              {lastLine.kind === 'step' && !isCommandLine(lastLine) && lastLine.detail
                ? ` ${lastLine.detail}`
                : ''}
            </p>
          )}
        </div>
      )}
      {phase === 'done' && result && (
        <div data-testid="lint-ai-result">
          {result.status === 'found' && (
            <>
              <p className="text-caption mb-1">{t.lintView.ai.found(result.findings.length)}</p>
              <ul className="divide-y divide-hairline">
                {result.findings.map((f, i) => (
                  <li key={i} className="py-1.5" data-testid="lint-ai-finding">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={f.severity} />
                      <span className="text-caption text-muted-foreground">
                        {t.lintView.ai.kind[f.kind]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-callout">{f.title}</span>
                    </div>
                    <p className="text-caption text-muted-foreground mt-0.5">
                      {f.rel ? `${f.rel}${f.rel2 ? ` · ${f.rel2}` : ''} — ` : ''}
                      {f.detail}
                    </p>
                    {f.kind === 'duplicate' && f.rel2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground mt-0.5 px-1 text-caption"
                        data-testid="merge-from-lint"
                        onClick={() => setMerging([f.rel, f.rel2!])}
                      >
                        {t.lintView.ai.merge}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {result.status === 'clean' && (
            <p className="text-caption flex items-center gap-1">
              <CheckCircle2 className="size-4" aria-hidden /> {t.lintView.ai.clean}
            </p>
          )}
          {result.status === 'unparsed' && (
            <p
              className="text-caption text-destructive flex items-center gap-1"
              data-testid="lint-ai-unparsed"
            >
              <TriangleAlert className="size-4" aria-hidden /> {t.lintView.ai.unparsed}
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            data-testid="lint-ai-again"
            onClick={() => {
              setPhase('idle')
              setResult(null)
            }}
          >
            {t.lintView.again}
          </Button>
        </div>
      )}
      {merging && (
        <MergeDialog
          rels={merging}
          onClose={(merged) => {
            // 합쳤으면 그 발견은 끝났다 — 지운 페이지를 가리키는 합치기를 다시 누르지 않게 목록에서 뺀다
            if (merged && result?.status === 'found') {
              const findings = result.findings.filter(
                (f) => !(f.kind === 'duplicate' && f.rel === merging[0] && f.rel2 === merging[1])
              )
              setResult(findings.length > 0 ? { status: 'found', findings } : { status: 'clean' })
            }
            setMerging(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * 가리킨 곳이 없는 링크 — 대상별로 묶어(Obsidian 의 unresolved links) 그 이름의 노트를 바로 만든다.
 * 위키 목록만 보고 바로 센다 — 점검을 기다리지 않는다
 */
const UnresolvedLinks = (): React.JSX.Element | null => {
  const t = useT()
  const pages = useWorkbench((s) => s.pages)
  const newNote = useWorkbench((s) => s.newNote)
  const openPeek = useWorkbench((s) => s.openPeek)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const groups = useMemo(() => (pages === null ? [] : unresolvedLinks(pages)), [pages])
  if (groups.length === 0) return null
  const create = (target: string): void => {
    setError(null)
    setNotice(null)
    const slash = target.lastIndexOf('/')
    const folder = slash >= 0 ? `wiki/${target.slice(0, slash)}` : 'wiki'
    void newNote(folder, target.slice(slash + 1)).then((made) => {
      if ('error' in made)
        setError(toUserError(made.error, getT().lintView.unresolved.createFailed).text)
      // 만든 노트는 그 자리에서 연다(newNote 가 openFile 까지 한다) — 어디로 갔는지 한 줄로 알린다
      else setNotice(getT().lintView.unresolved.created(target))
    })
  }
  return (
    <section data-testid="lint-unresolved" className="flex flex-col gap-2">
      <h3 className="text-label font-medium">
        {t.lintView.unresolved.title} <span className="tabular-nums">{groups.length}</span>
      </h3>
      {notice && (
        <p role="status" className="text-caption text-muted-foreground">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
        {groups.map((g) => (
          <li
            key={g.target}
            data-testid={`lint-unresolved:${g.target}`}
            className="flex items-center gap-3 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-label">{g.target}</p>
              <p className="truncate text-caption text-muted-foreground">
                {g.sources.map((s, i) => (
                  <span key={s.rel}>
                    {i > 0 && ' · '}
                    <button
                      type="button"
                      className="focus-ring rounded-sm hover:underline"
                      onClick={() => openPeek(s.rel)}
                    >
                      {s.title}
                    </button>
                  </span>
                ))}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              data-testid={`lint-unresolved-create:${g.target}`}
              onClick={() => create(g.target)}
            >
              {t.lintView.unresolved.create}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export const LintView = (): React.JSX.Element => {
  const t = useT()
  const [report, setReport] = useState<LintReport | null>(null)
  const [error, setError] = useState<UserError | null>(null)
  const [filter, setFilter] = useState<LintKind | 'all'>('all')
  const [attempt, setAttempt] = useState(0)
  // 구역을 다시 열 때마다 다시 점검한다 — 볼트가 바뀌어도 최신 상태를 보여 주기 위해
  const active = useWorkbench((s) => s.view === 'knowledge' && s.knowledgeSection === 'lint')

  // 옆 칸에서 고치고 돌아오면 목록이 낡는다 — 파일이 바뀌면 보고 있는 동안 다시 받는다.
  // lintWiki 는 읽기 전용이라 이 새로고침이 다시 바뀜을 만들지 않는다(무한 루프 없음).
  // 보고 있지 않을 때는 안 받는다 — 돌아오면 구역 진입 효과가 처음부터 다시 받는다
  useEffect(
    () =>
      window.api.onWikiChanged(() => {
        if (active) setAttempt((n) => n + 1)
      }),
    [active]
  )

  useEffect(() => {
    if (!active) return
    let stale = false
    void (async () => {
      // 상태 비우기는 await 앞이지만 effect 본문 밖이다 — 규칙의 보수적 오탐을 피해 여기서 한다.
      // report 는 비우지 않는다 — null 이 되면 AI 점검 칸이 언마운트돼 진행 중인 점검이 죽는다. 낡은 목록을 두로 새로 받는다
      setError(null)
      try {
        const result = await window.api.lintWiki()
        if (stale) return
        if ('error' in result) setError(toUserError(result.error, getT().lintView.failed))
        else setReport(result)
      } catch (e) {
        // 실패를 삼키면 본문이 영원히 빈칸으로 남는다
        if (!stale) setError(toUserError(e, getT().lintView.failed))
      }
    })()
    return () => {
      stale = true
    }
  }, [active, attempt])

  const shown = useMemo(
    () =>
      report && filter !== 'all'
        ? report.structure.filter((f) => f.kind === filter)
        : (report?.structure ?? []),
    [report, filter]
  )

  return (
    <>
      <ViewHeader title={t.lintView.title} description={t.lintView.description} />
      <ViewBody>
        <div className="flex min-h-0 flex-1 flex-col gap-4" data-testid="lint-view">
          <UnresolvedLinks />
          {error && (
            <EmptyState
              icon={TriangleAlert}
              title={error.text}
              description={t.lintView.failedHint}
              action={{
                label: t.lintView.again,
                testId: 'lint-retry',
                onClick: () => setAttempt((n) => n + 1)
              }}
            />
          )}
          {!report && !error && (
            <p className="text-caption text-muted-foreground flex items-center gap-2" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden /> {t.lintView.checking}
            </p>
          )}
          {report && (
            <>
              {/* 종류별 필터·개수 */}
              {/* 목록 거르기 — 탭이 아니라 눌린 상태가 있는 버튼 묶음이다 */}
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="group"
                  aria-label={t.lintView.filterGroup}
                  data-testid="lint-filters"
                  className="flex min-w-0 flex-1 flex-wrap gap-2"
                >
                  <button
                    type="button"
                    aria-pressed={filter === 'all'}
                    onClick={() => setFilter('all')}
                    className={cn(
                      'focus-ring tactile rounded border border-hairline px-2 py-1 text-caption tabular-nums hover:bg-accent min-h-8',
                      filter === 'all' && 'bg-accent font-medium text-foreground'
                    )}
                  >
                    {t.lintView.all} {report.structure.length}
                  </button>
                  {KINDS.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={filter === kind}
                      aria-label={t.lintView.kindCount(
                        t.lintView.kinds[kind].label,
                        report.structure.filter((f) => f.kind === kind).length,
                        t.lintView.kinds[kind].hint
                      )}
                      onClick={() => setFilter(kind)}
                      className={cn(
                        'focus-ring tactile rounded border border-hairline px-2 py-1 text-caption tabular-nums hover:bg-accent min-h-8',
                        filter === kind && 'bg-accent font-medium text-foreground'
                      )}
                    >
                      {t.lintView.kinds[kind].label}{' '}
                      {report.structure.filter((f) => f.kind === kind).length}
                    </button>
                  ))}
                </div>
                {/* 고치고 돌아오면 목록 아래가 아니라 여기서 다시 받는다 — 오류 때만 있던 길이다 */}
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="lint-refresh"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="shrink-0"
                >
                  {t.lintView.again}
                </Button>
              </div>
              {report.structure.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title={t.lintView.cleanTitle}
                  description={t.lintView.cleanHint}
                />
              ) : shown.length === 0 ? (
                <p className="text-caption text-muted-foreground rounded-lg border border-hairline px-3 py-4 text-center">
                  {filter !== 'all' && t.lintView.noKindMatch(t.lintView.kinds[filter].label)}
                </p>
              ) : (
                <div className="divide-y divide-hairline rounded-lg border border-hairline">
                  {shown.map((f, i) => (
                    <FindingRow
                      key={`${f.kind}:${f.rel}:${f.kind === 'broken-link' ? f.target : i}`}
                      finding={f}
                    />
                  ))}
                </div>
              )}
              {/* vault_verify --lane none — 볼트 폴더가 아니면 검증 불가 항목 */}{' '}
              <div className="rounded-lg border border-hairline p-4" data-testid="lint-verify">
                <p className="flex items-center gap-2 text-callout">
                  {report.verify.status === 'pass' ? (
                    <CheckCircle2 aria-hidden className="size-4 text-primary-ink" />
                  ) : (
                    <TriangleAlert aria-hidden className="size-4 text-warning-foreground" />
                  )}
                  {t.lintView.verify.head}{' '}
                  {report.verify.status === 'pass'
                    ? t.lintView.verify.pass
                    : report.verify.status === 'fail'
                      ? t.lintView.verify.fail
                      : t.lintView.verify.unavailable}
                </p>
                {report.verify.status === 'fail' && (
                  <ul className="text-caption text-muted-foreground list-disc pl-5">
                    {report.verify.defects.map((d, i) => {
                      const defect = readDefect(d)
                      return (
                        <li key={i}>
                          {defect.fix}
                          {defect.rel && (
                            <span className="text-muted-foreground">
                              {' '}
                              — {defect.rel}
                              {defect.line !== null ? t.review.line(defect.line) : ''}
                            </span>
                          )}
                          {/* 원문은 접어 둔다 — 화면 말(고치는 일)만 보인다 */}
                          <details>
                            <summary className="focus-ring text-muted-foreground cursor-pointer">
                              {t.shell.details}
                            </summary>
                            <p className="text-caption">{defect.message}</p>
                          </details>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {report.verify.status === 'unavailable' && (
                  <p className="text-caption text-muted-foreground">
                    {t.lintView.verify.cannotRun} <span>({report.verify.reason})</span>
                  </p>
                )}
              </div>
              <AiLintSection />
            </>
          )}
        </div>
      </ViewBody>
    </>
  )
}
