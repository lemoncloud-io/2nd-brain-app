import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, CircleCheck, ClipboardCheck, RefreshCw, Undo2 } from 'lucide-react'
import type { FinalizeOutcome, ReviewListing, TeamReview } from '../../../shared/ipc-contract'
import { EmptyState, ViewBody, ViewHeader } from '../components/layout/view'
import { ErrorNote } from '../components/error-note'
import { Button } from '../components/ui/button'
import { readDefect } from '../../../shared/wiki/verify-defect'
import { runLabel } from '../lib/ingest-run'
import { toUserError } from '../lib/user-error'
import { cn } from '../lib/utils'
import { ConflictPicker } from '../views/conflict-picker'
import { ReviewItemsSection } from '../views/review-items-section'
import { useWorkbench } from '../store/workbench'
import { useNextStep } from '../hooks/use-next-step'
import { useSetup } from '../hooks/use-setup'
import { aheadFilesText } from '../lib/sync-text'
import { publishFailedText, readCountText } from '../lib/review-text'
import { getT, useT } from '../lib/i18n'

/** 페이지 맨 위에 적힌 출처 — 없으면 null. 목록·주소 어느 쪽이든 한 줄로 만든다 */
const readSource = (frontmatter: Record<string, unknown> | null): string | null => {
  const value = frontmatter?.source
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === 'string' && entry.trim() !== '')
    return typeof first === 'string' ? first.trim() : null
  }
  return null
}

// wiki/topics/ai.md → topics — 위키 맨 위 페이지는 위치를 따로 적지 않는다
const folderOf = (path: string): string => path.split('/').slice(1, -1).join('/')

type Message = { text: string; ok: boolean; detail?: string | null }
/** 방금 끝난 병합 — 되돌리기는 이 브랜치로만 한다 */
type Merged = {
  branch: string
  approved: number
  /** 넣은 페이지 중 첫 것 — 결과 카드의 "위키에서 보기" 가 연다. 다 거절했으면 null */
  firstPage: string | null
  rejected: string[]
  /** 팀 저장소에 열린 확인 — 팀 저장소가 없으면 null */
  teamReview: TeamReview | null
  /** 내 위키에는 들어갔지만 팀에 보내지 못한 사유 */
  shareError: string | null
  /** 혼자 쓰는 내 저장소에 올렸으면 그 웹 주소 */
  published: string | null
  /** 혼자 쓰는 내 저장소에 올리지 못한 사유 — 다시 올리기를 내민다 */
  publishError: string | null
}

/** 예외 → 메시지. 문장은 무엇이 안 됐는지 말하고 원문은 접어 둔다 */
const failed = (error: unknown, what: string): Message => ({
  ...toUserError(error, what),
  ok: false
})

const failureMessage = (outcome: Exclude<FinalizeOutcome, { status: 'merged' }>): Message =>
  outcome.status === 'verify-failed'
    ? {
        text: getT().review.verifyFailed(outcome.defects.length),
        ok: false
      }
    : { ...toUserError(outcome.reason, getT().review.mergeFailed), ok: false }

export const ReviewSection = (): React.JSX.Element => {
  const t = useT()
  const [listing, setListing] = useState<ReviewListing | null>(null)
  const [rejected, setRejected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<Message | null>(null)
  const [defects, setDefects] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  // 확정은 되돌리기 전까지 기본 브랜치를 바꾼다 — 누르면 무엇이 병합·원복되는지 먼저 보인다
  const [confirming, setConfirming] = useState(false)
  const [merged, setMerged] = useState<Merged | null>(null)
  // 위키화 결과가 없다 — 빨간 오류 대신 다음 행동이 있는 빈 상태
  const [idle, setIdle] = useState(false)
  // 이번 승인에서 `읽기` 로 열어 본 페이지 — 위키 초안이 바뀌면 처음부터 센다
  const [read, setRead] = useState<{ branch: string | null; paths: Set<string> }>({
    branch: null,
    paths: new Set()
  })
  const next = useNextStep()
  const { sync, remote } = useSetup()
  // 탭 진입 effect 가 부르는 refresh 가 최신 병합 여부를 읽는다
  const mergedRef = useRef<Merged | null>(null)
  useEffect(() => {
    mergedRef.current = merged
  }, [merged])
  const mergeButton = useRef<HTMLButtonElement>(null)
  // 확정이 검증 결함을 검토 항목에 더했을 수 있다 — 끝나면 목록을 다시 읽게 한다
  const [itemsKey, setItemsKey] = useState(0)

  // 목록만 다시 읽는다. 사라진 페이지(이전 확정이 이미 정리한 것)는 거절 선택에서도 뺀다.
  const refresh = (): Promise<void> =>
    window.api.listReview().then((result) => {
      if ('error' in result) {
        setListing(null)
        setIdle(!!result.idle)
        if (result.idle) return
        // 병합 직후엔 작업 브랜치가 없는 게 정상이다 — 성공 표시를 그 사유로 덮지 않는다
        if (!mergedRef.current) {
          setMessage({ ...toUserError(result.error, getT().review.listFailed), ok: false })
        }
        return
      }
      setMerged(null)
      setIdle(false)
      setListing(result)
      setRead((prev) =>
        prev.branch === result.branch ? prev : { branch: result.branch, paths: new Set() }
      )
      setRejected(
        (prev) => new Set([...prev].filter((path) => result.pages.some((p) => p.path === path)))
      )
    })

  const load = (): void => {
    setMessage(null)
    setDefects([])
    refresh().catch((error: unknown) => setMessage(failed(error, getT().review.listFailed)))
  }

  // 탭에 들어올 때마다 승인할 페이지를 읽는다 — 위키화가 끝난 뒤 버튼을 찾지 않아도 된다
  const view = useWorkbench((s) => s.view)
  const section = useWorkbench((s) => s.knowledgeSection)
  const openPeek = useWorkbench((s) => s.openPeek)
  const openFile = useWorkbench((s) => s.openFile)
  // 승인 중에는 작업 브랜치가 체크아웃돼 있어 위키 목록에 새 페이지 제목도 들어 있다
  const pageList = useWorkbench((s) => s.pages)
  // 행마다·렌더마다 통째로 다시 짓지 않는다 — 목록이 바뀔 때만
  const titles = useMemo(
    () => new Map((pageList ?? []).map((entry) => [entry.rel, entry.title] as const)),
    [pageList]
  )
  // 무엇을 읽고 만든 페이지인지 — 출처 없이 20건을 승인하면 읽기를 그만두게 된다
  const sources = useMemo(
    () =>
      new Map((pageList ?? []).map((entry) => [entry.rel, readSource(entry.frontmatter)] as const)),
    [pageList]
  )
  useEffect(() => {
    if (view !== 'knowledge' || section !== 'review') return
    // 상태는 목록 응답이 온 뒤에만 바꾼다(refresh 의 then). 지난 결과 문구는 사용자가 볼 수 있게 남긴다
    refresh().catch((error: unknown) => setMessage(failed(error, getT().review.listFailed)))
    // 탭 진입만 신호로 쓴다 — refresh 는 렌더마다 새로 만들어진다
  }, [view, section])

  // 행의 승인·거절은 양방향 단추 — 체크 해제가 거절이 되는 반전 모델을 쓰지 않는다
  const setDecision = (path: string, approved: boolean): void =>
    setRejected((prev) => {
      if (prev.has(path) === !approved) return prev
      const next = new Set(prev)
      if (approved) next.delete(path)
      else next.add(path)
      return next
    })

  const setAll = (rejectAll: boolean): void =>
    setRejected(new Set(rejectAll && listing ? listing.pages.map((p) => p.path) : []))

  // 확인 줄이 열리면 병합 버튼으로 초점을 옮긴다 — Enter 로 진행, Escape 로 닫는다
  useEffect(() => {
    if (confirming) mergeButton.current?.focus()
  }, [confirming])

  // 두 번 누르면 병합이 두 번 돈다 — busy 는 다음 렌더까지 안 바뀌므로 ref 로 막는다
  const finalizing = useRef(false)
  const finalizeNow = (): void => {
    if (!listing || finalizing.current) return
    finalizing.current = true
    const approved = listing.pages.length - rejected.size
    const firstPage = listing.pages.find((p) => !rejected.has(p.path))?.path ?? null
    setConfirming(false)
    setBusy(true)
    setMessage(null)
    window.api
      .finalizeReview([...rejected])
      .then((outcome) => {
        setDefects(outcome.status === 'verify-failed' ? outcome.defects : [])
        if (outcome.status !== 'merged') {
          setMessage(failureMessage(outcome))
          return refresh()
        }
        setMerged({
          branch: outcome.branch,
          approved,
          firstPage,
          rejected: outcome.rejected,
          teamReview: outcome.teamReview,
          shareError: outcome.shareError,
          published: outcome.published,
          publishError: outcome.publishError
        })
        setRejected(new Set())
        setListing(null)
        return undefined
      })
      .catch((error: unknown) => setMessage(failed(error, getT().review.mergeFailed)))
      .finally(() => {
        finalizing.current = false
        setBusy(false)
        setItemsKey((key) => key + 1)
      })
  }

  // 넣기 뒤 자동 올리기가 실패했을 때 — "지금 올리기" 와 같은 길(받기 → 공개 검사 → 올리기)
  const [republishing, setRepublishing] = useState(false)
  // 다시 올리기가 성공하면 그 단추가 사라진다 — 포커스를 "GitHub에서 보기" 로 옮겨 body 로 떨어지지 않게
  const publishedOpen = useRef<HTMLButtonElement>(null)
  const focusPublished = useRef(false)
  useEffect(() => {
    if (!focusPublished.current || merged?.published == null) return
    focusPublished.current = false
    publishedOpen.current?.focus()
  }, [merged?.published])
  const republish = (): void => {
    if (!merged) return
    setBusy(true)
    setRepublishing(true)
    setMessage(null)
    window.api
      .pushRemote()
      .then((result) => {
        focusPublished.current = result.ok
        setMerged((now) =>
          now === null
            ? now
            : result.ok
              ? { ...now, published: remote?.webUrl ?? '', publishError: null }
              : { ...now, publishError: result.reason }
        )
      })
      .catch((error: unknown) => setMessage(failed(error, getT().review.publishFailedHead)))
      .finally(() => {
        setBusy(false)
        setRepublishing(false)
      })
  }

  const undo = (): void => {
    if (!merged) return
    setBusy(true)
    setMessage(null)
    window.api
      .undoMerge(merged.branch)
      .then((outcome) => {
        if (outcome.status === 'failed') {
          setMessage({ ...toUserError(outcome.reason, getT().review.undoFailed), ok: false })
          return undefined
        }
        setMerged(null)
        setMessage({
          text: getT().review.undone,
          ok: true
        })
        return refresh()
      })
      .catch((error: unknown) => setMessage(failed(error, getT().review.undoFailed)))
      .finally(() => {
        setBusy(false)
        setItemsKey((key) => key + 1)
      })
  }

  const pageCount = listing?.pages.length ?? 0
  const approvedCount = pageCount - rejected.size
  const readCount = listing?.pages.filter((p) => read.paths.has(p.path)).length ?? 0
  const openToRead = (path: string): void => {
    setRead((prev) =>
      prev.paths.has(path) ? prev : { branch: prev.branch, paths: new Set([...prev.paths, path]) }
    )
    openPeek(path)
  }

  return (
    <>
      <ViewHeader
        title={t.review.title}
        description={listing ? t.review.descRun(runLabel(listing.branch)) : t.review.desc}
      >
        <Button variant="outline" data-testid="review-load" disabled={busy} onClick={load}>
          <RefreshCw aria-hidden />
          {t.review.reload}
        </Button>
        {/* 머리는 동작 둘만 — 넷이면 줄이 넘쳐 52px 머리가 두 줄이 됐다. 전체 승인·거절은 목록 위 줄에 */}
        {listing && (
          <Button
            data-testid="review-finalize"
            disabled={busy || confirming}
            onClick={() => setConfirming(true)}
          >
            {t.review.finalize}
          </Button>
        )}
      </ViewHeader>
      <ViewBody>
        {/* 고르기를 기다리는 문서가 있으면 그것이 먼저다 — 승인보다 앞선다 */}
        <ConflictPicker />
        <ReviewItemsSection refreshKey={itemsKey} />
        {listing && confirming && (
          <div
            role="alertdialog"
            aria-labelledby="review-confirm-title"
            data-testid="review-confirm"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-hairline bg-elevated px-4 py-3 shadow-raised"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setConfirming(false)
            }}
          >
            <div className="min-w-0 flex-1">
              <p id="review-confirm-title" className="text-callout text-foreground">
                {approvedCount > 0 ? t.review.confirmCount(approvedCount) : t.review.confirmNone}
                {rejected.size > 0 && t.review.confirmRejected(rejected.size)}
              </p>
              <p data-testid="review-confirm-read" className="text-caption text-muted-foreground">
                {readCountText(readCount, pageCount)}
              </p>
              {remote && (
                <p data-testid="review-confirm-team" className="text-caption text-muted-foreground">
                  {t.review.teamReview}
                </p>
              )}
              <p className="text-caption text-muted-foreground">{t.review.undoWindow}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                data-testid="review-confirm-cancel"
                onClick={() => setConfirming(false)}
              >
                {t.review.cancel}
              </Button>
              <Button
                ref={mergeButton}
                size="sm"
                data-testid="review-confirm-merge"
                disabled={busy}
                onClick={finalizeNow}
              >
                {t.review.merge}
              </Button>
            </div>
          </div>
        )}
        {merged && (
          <div
            data-testid="review-result"
            role="status"
            className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-hairline bg-elevated px-4 py-3 shadow-raised"
          >
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-callout text-foreground">{t.review.merged(merged.approved)}</p>
              <p className="wrap-anywhere text-caption text-muted-foreground">
                {runLabel(merged.branch)}
                {merged.rejected.length > 0 &&
                  t.review.mergedRejected(
                    merged.rejected.map((r) => titles.get(r) ?? r).join(', ')
                  )}
              </p>
              {/* 승인은 이 컴퓨터에서 끝났다 — 팀에 갔는지는 다른 질문이라 여기서 답한다 */}
              {merged.published !== null ? (
                <p
                  data-testid="review-published"
                  className="mt-1 text-caption text-muted-foreground"
                >
                  {t.review.published}
                  {merged.published !== '' && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        ref={publishedOpen}
                        data-testid="review-published-open"
                        className="focus-ring rounded-sm text-primary-ink underline-offset-4 hover:underline"
                        onClick={() => void window.api.openExternal(merged.published!)}
                      >
                        {t.review.openGithub}
                      </button>
                    </>
                  )}
                </p>
              ) : merged.publishError ? (
                <p
                  data-testid="review-publish-error"
                  className="mt-1 text-caption text-destructive"
                >
                  {republishing ? t.review.republishing : publishFailedText(merged.publishError)}
                </p>
              ) : merged.teamReview ? (
                <p data-testid="review-team" className="mt-1 text-caption text-muted-foreground">
                  {t.review.teamChecking}{' '}
                  <button
                    type="button"
                    data-testid="review-team-open"
                    className="focus-ring rounded-sm text-primary-ink underline-offset-4 hover:underline"
                    onClick={() => void window.api.openExternal(merged.teamReview!.url)}
                  >
                    {t.review.openTeam}
                  </button>
                </p>
              ) : merged.shareError ? (
                <p data-testid="review-team" className="mt-1 text-caption text-destructive">
                  {t.review.shareFailed(merged.shareError)}
                </p>
              ) : (
                <p
                  data-testid="review-unpushed"
                  className="mt-1 text-caption text-muted-foreground"
                >
                  {sync.ahead > 0 ? t.review.ahead(sync.ahead) : t.review.nothingAhead}
                  {aheadFilesText(sync.aheadFiles) && (
                    <span data-testid="review-unpushed-files" className="block">
                      {aheadFilesText(sync.aheadFiles)}
                    </span>
                  )}
                </p>
              )}
              {merged.published === null && (
                <p
                  data-testid="review-undo-window"
                  className="mt-1 text-caption text-muted-foreground"
                >
                  {t.review.undoWindow}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {merged.firstPage && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="review-open-wiki"
                  onClick={() => openFile(merged.firstPage!)}
                >
                  {t.review.openWiki}
                </Button>
              )}
              {merged.publishError && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="review-republish"
                  disabled={busy}
                  onClick={republish}
                >
                  <RefreshCw aria-hidden className={cn(republishing && 'animate-spin')} />
                  {t.review.republish}
                </Button>
              )}
              {merged.published === null && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="review-undo"
                  disabled={busy}
                  onClick={undo}
                >
                  <Undo2 aria-hidden />
                  {t.review.undo}
                </Button>
              )}
            </div>
          </div>
        )}
        {message &&
          (message.detail ? (
            <ErrorNote
              error={{ text: message.text, detail: message.detail }}
              testId="review-result"
              className="text-callout"
            />
          ) : (
            <p
              data-testid="review-result"
              role="status"
              className={cn(
                'wrap-anywhere text-callout',
                message.ok ? 'text-label' : 'text-destructive'
              )}
            >
              {message.text}
            </p>
          ))}
        {defects.length > 0 && (
          <ul
            data-testid="review-defects"
            className="divide-y divide-hairline rounded-lg border border-destructive/30 bg-elevated shadow-raised"
          >
            {defects.map((defect, index) => {
              const { rel, line, fix, message: detail } = readDefect(defect)
              // 승인 목록의 페이지면 여기서 바로 거절할 수 있다 — 볼트 기억 파일 같은 부속 파일은 읽기만
              const reviewable = rel !== null && !!listing?.pages.some((p) => p.path === rel)
              const isRejected = rel !== null && rejected.has(rel)
              return (
                <li
                  key={index}
                  data-testid={`review-defect-${index}`}
                  className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-callout text-foreground">{fix}</p>
                    <p className="wrap-anywhere text-caption text-muted-foreground">
                      {rel && (
                        <span className="text-label">
                          {rel}
                          {line !== null && t.review.line(line)}
                        </span>
                      )}
                      {rel && ' — '}
                      {detail}
                    </p>
                  </div>
                  {rel && (
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`review-defect-open-${index}`}
                        onClick={() => openPeek(rel, line)}
                      >
                        {t.review.read}
                      </Button>
                      {reviewable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-pressed={isRejected}
                          data-testid={`review-defect-reject-${index}`}
                          disabled={busy}
                          onClick={() => setDecision(rel, isRejected)}
                        >
                          {isRejected ? t.review.rejectUndo : t.review.rejectPage}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {listing ? (
          <>
            <div className="-mb-3 flex flex-wrap items-center gap-2">
              <p
                data-testid="review-read-count"
                className="min-w-0 flex-1 text-caption text-muted-foreground"
              >
                {readCountText(readCount, pageCount)}
              </p>
              <Button
                variant="ghost"
                size="sm"
                data-testid="review-approve-all"
                disabled={busy || rejected.size === 0}
                onClick={() => setAll(false)}
              >
                {t.review.approveAll}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid="review-reject-all"
                disabled={busy || pageCount === 0 || rejected.size === pageCount}
                onClick={() => setAll(true)}
              >
                {t.review.rejectAll}
              </Button>
            </div>
            <ul
              data-testid="review-pages"
              className="divide-y divide-hairline rounded-lg border border-hairline bg-elevated shadow-raised"
            >
              {listing.pages.map((page) => {
                const approved = !rejected.has(page.path)
                const opened = read.paths.has(page.path)
                const title = titles.get(page.path) ?? page.slug
                return (
                  <li key={page.path} data-testid={`review-row-${page.path}`}>
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <span
                        className={cn(
                          'shrink-0 rounded-sm px-1.5 text-caption',
                          page.status === 'added'
                            ? 'bg-primary/10 text-primary-ink'
                            : 'bg-secondary text-muted-foreground'
                        )}
                      >
                        {t.review.status[page.status]}
                      </span>
                      {/* 제목이 먼저, 위치는 옅게 — 232페이지 볼트에서 경로만으로는 페이지를 못 알아본다 */}
                      <span className="flex min-w-0 flex-1 items-baseline gap-2" title={page.path}>
                        <span
                          data-testid={`review-title-${page.path}`}
                          className={cn(
                            'min-w-0 truncate text-callout',
                            approved ? 'text-foreground' : 'text-muted-foreground line-through'
                          )}
                        >
                          {title}
                        </span>
                        <span className="shrink-0 truncate text-caption text-muted-foreground">
                          {folderOf(page.path)}
                        </span>
                        {sources.get(page.path) && (
                          <span
                            data-testid={`review-source-${page.path}`}
                            title={sources.get(page.path) ?? undefined}
                            className="min-w-0 truncate text-caption text-muted-foreground"
                          >
                            {t.review.source(sources.get(page.path) ?? '')}
                          </span>
                        )}
                      </span>
                      {/* 승인 전에 읽어 본다 — 작업 브랜치가 체크아웃돼 있어 리더가 새 내용을 보여 준다 */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-caption text-muted-foreground"
                        data-testid={`review-open-${page.path}`}
                        data-read={opened}
                        aria-label={
                          opened ? t.review.rereadLabel(title) : t.review.readLabel(title)
                        }
                        onClick={() => openToRead(page.path)}
                      >
                        {opened && <Check aria-hidden className="size-3.5" />}
                        {opened ? t.review.readDone : t.review.read}
                      </Button>
                      <div
                        role="group"
                        aria-label={t.review.decisionLabel(title)}
                        className="flex shrink-0 gap-1.5"
                      >
                        {/* 고른 쪽은 중립 채움 + 체크 — 주황 채움은 머리의 "위키에 넣기" 하나뿐이다.
                            기본이 승인이라 주황이면 행마다 아무것도 안 한 상태가 주 행동처럼 보였다 */}
                        <Button
                          variant={approved ? 'secondary' : 'outline'}
                          size="sm"
                          className="h-7 gap-1 px-2 text-caption [&_svg]:size-3.5"
                          aria-pressed={approved}
                          data-testid={`review-approve-${page.path}`}
                          disabled={busy}
                          onClick={() => setDecision(page.path, true)}
                        >
                          {approved && <Check aria-hidden />}
                          {t.review.approve}
                        </Button>
                        <Button
                          variant={approved ? 'outline' : 'secondary'}
                          size="sm"
                          className="h-7 gap-1 px-2 text-caption [&_svg]:size-3.5"
                          aria-pressed={!approved}
                          data-testid={`review-reject-${page.path}`}
                          disabled={busy}
                          onClick={() => setDecision(page.path, false)}
                        >
                          {!approved && <Check aria-hidden />}
                          {t.review.reject}
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
            {listing.others.length > 0 && (
              <details className="rounded-lg border border-hairline">
                <summary className="focus-ring cursor-pointer rounded-lg px-4 py-2.5 text-callout text-label">
                  {t.review.others(listing.others.length)}
                </summary>
                <ul className="border-t border-hairline px-4 py-2.5">
                  {listing.others.map((change) => (
                    <li
                      key={change.path}
                      className="wrap-anywhere text-caption text-muted-foreground"
                    >
                      {t.review.change[change.status.charAt(0)] ?? change.status} · {change.path}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          !message &&
          !merged &&
          (idle ? (
            <EmptyState
              icon={ClipboardCheck}
              title={t.review.emptyTitle}
              description={t.review.emptyBody}
              action={next}
            />
          ) : (
            // 읽는 중에는 빈 모양을 빌리지 않는다 — 빈 상태는 "없다" 는 뜻이라 거짓말이 된다
            <p role="status" className="text-caption text-muted-foreground">
              {t.review.loading}
            </p>
          ))
        )}
      </ViewBody>
    </>
  )
}
