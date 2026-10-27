// 문서 기록 — 옆 칸 기록 탭은 지금 가운데 문서의 버전 목록(누가 · 언제)을 보인다. 문서를 옮기면 따라간다.
// 탭은 기록을 보는 동안만 띠에 있다 — 머리의 닫기 단추가 열기 전 자리로 돌려보낸다.
// 하나를 누르면 가운데에 그 버전과 지금 글의 바뀐 줄이 뜬다(`history-diff.tsx`).
// 문서가 바뀌면(저장·되돌리기·받기) 목록을 다시 받는다.
import { useEffect, useRef, useState } from 'react'
import { History, X } from 'lucide-react'
import { DOC_HISTORY_LIMIT, type DocHistory } from '../../../../shared/ipc-contract'
import { EmptyState } from '../../components/layout/view'
import { ErrorNote } from '../../components/error-note'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'
import { versionWhen, versionWho } from '../../lib/doc-version'
import { toUserError, type UserError } from '../../lib/user-error'
import { fileTitle } from '../../lib/vault-path'
import { isTextFile } from '../../../../shared/vault-file-types'
import { useWorkbench } from '../../store/workbench'
import { useSidecarFocus } from '../../hooks/use-sidecar-focus'
import { useWikiRead } from './use-wiki-read'
import { getT, useT } from '../../lib/i18n'

export const HistoryPane = (): React.JSX.Element => {
  const t = useT()
  // 가운데 문서 — 리더의 md, 또는 미리보기의 글자 파일(html·코드). 그림·PDF 는 줄로 견줄 것이 없다
  const page = useWorkbench((s) => (s.docMode === 'page' ? s.selectedPage : null))
  const source = useWorkbench((s) => (s.docMode === 'source' ? s.selectedSource : null))
  if (page !== null) return <PageHistory rel={page} />
  if (source !== null && isTextFile(source)) return <SourceHistory rel={source} />
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex justify-end px-2 pt-3">
        <HistoryClose />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <EmptyState
          icon={History}
          title={source !== null ? t.wikiPanes.history.noTextTitle : t.wikiPanes.history.noDocTitle}
          description={
            source !== null ? t.wikiPanes.history.noTextHint : t.wikiPanes.history.noDocHint
          }
        />
      </div>
    </div>
  )
}

/** 기록 탭은 눌러 여는 길이 없다 — 닫으면 열기 전 자리로 돌아간다 */
const HistoryClose = (): React.JSX.Element => {
  const t = useT()
  const toggleHistory = useWorkbench((s) => s.toggleHistory)
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      aria-label={t.wikiPanes.history.close}
      data-testid="history-pane-close"
      onClick={toggleHistory}
    >
      <X aria-hidden />
    </Button>
  )
}

/** md — 글이 바뀌면 해시가 바뀐다. 문서를 못 읽으면 해시가 없어 다시 받지 않지만, 그때는 처음 받은 목록이 맞다(바뀐 글을 모른다) */
const PageHistory = ({ rel }: { rel: string }): React.JSX.Element => {
  const { read } = useWikiRead(rel)
  return <HistoryList rel={rel} stamp={read?.hash ?? ''} />
}

/** md 가 아닌 글자 파일 — 리더가 읽지 않으므로 파일이 바뀌었다는 알림을 직접 듣는다 */
const SourceHistory = ({ rel }: { rel: string }): React.JSX.Element => {
  const [changes, setChanges] = useState(0)
  useEffect(
    () =>
      window.api.onWikiChanged((rels) => {
        if (rels.length === 0 || rels.includes(rel)) setChanges((n) => n + 1)
      }),
    [rel]
  )
  return <HistoryList rel={rel} stamp={String(changes)} />
}

const HistoryList = ({
  rel,
  stamp
}: {
  rel: string
  /** 바뀌면 목록을 다시 받는다 */
  stamp: string
}): React.JSX.Element => {
  const t = useT()
  const openFile = useWorkbench((s) => s.openFile)
  const pickVersion = useWorkbench((s) => s.pickVersion)
  const pick = useWorkbench((s) => (s.versionPick?.rel === rel ? s.versionPick.version : null))
  const [state, setState] = useState<{
    key: string
    list: DocHistory | null
    error: UserError | null
  } | null>(null)
  const key = `${rel}|${stamp}`
  // 밖(미리보기 기록 단추)에서 열면 제목으로 초점이 따라간다 — 칸 안 이동은 조용하다
  const titleRef = useRef<HTMLDivElement>(null)
  useSidecarFocus('history', titleRef)

  useEffect(() => {
    let stale = false
    window.api
      .docHistory(rel)
      .then((result) => {
        if ('error' in result) throw result.error
        if (!stale) setState({ key, list: result, error: null })
      })
      .catch((error: unknown) => {
        console.error('could not get the document history', error)
        if (!stale)
          setState({
            key,
            list: null,
            error: toUserError(error, getT().wikiPanes.history.readFailed)
          })
      })
    return () => {
      stale = true
    }
  }, [key, rel])

  const shown = state?.key === key ? state : null
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="history-pane">
      {/* 버전을 누르면 가운데가 바뀐다 — 초점은 목록에 둔 채 무엇이 열렸는지 들려준다 */}
      <p role="status" className="sr-only" data-testid="history-announce">
        {pick === null ? '' : t.wikiPanes.history.opened(versionWho(pick), versionWhen(pick))}
      </p>
      <div className="flex items-start gap-2 border-b border-hairline py-3 pr-2 pl-4">
        <div
          ref={titleRef}
          tabIndex={-1}
          data-sidecar-title="history"
          data-testid="history-title"
          className="min-w-0 flex-1 outline-none"
        >
          <p className="truncate text-callout font-medium" aria-label={rel}>
            {fileTitle(rel)}
          </p>
          <p className="text-caption text-muted-foreground">{t.wikiPanes.history.hint}</p>
        </div>
        <HistoryClose />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
        {shown === null ? (
          <p role="status" className="px-2 py-6 text-caption text-muted-foreground">
            {t.preview.loading}
          </p>
        ) : shown.error ? (
          <ErrorNote error={shown.error} testId="history-error" className="px-2 py-4" />
        ) : shown.list?.recorded === false ? (
          <p
            className="px-2 py-6 text-caption text-muted-foreground"
            data-testid="history-unrecorded"
          >
            {t.wikiPanes.history.unrecorded}
          </p>
        ) : shown.list?.versions.length === 0 ? (
          <p className="px-2 py-6 text-caption text-muted-foreground" data-testid="history-empty">
            {t.wikiPanes.history.empty}
          </p>
        ) : (
          <>
            {shown.list?.labelsPartial && (
              <p
                role="status"
                data-testid="history-labels-partial"
                className="px-2 pb-2 text-caption text-muted-foreground"
              >
                {t.wikiPanes.history.labelsPartial}
              </p>
            )}
            <ol aria-label={t.wikiPanes.history.list} className="flex flex-col gap-0.5">
              {shown.list?.versions.map((version, at) => {
                const picked = pick?.rev === version.rev
                return (
                  <li key={version.rev}>
                    <button
                      type="button"
                      data-testid={`history-version:${at}`}
                      data-history-rev={version.rev}
                      aria-current={picked ? 'true' : undefined}
                      onClick={() => {
                        // 가운데가 지식 관리·설정이면 문서 자리로 돌아온다 — 바뀐 줄은 리더·미리보기 자리에 뜬다
                        if (useWorkbench.getState().view !== 'doc') openFile(rel)
                        pickVersion({ rel, version })
                      }}
                      className={cn(
                        'focus-ring tactile flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left',
                        picked ? 'bg-accent text-foreground' : 'hover:bg-accent/60'
                      )}
                    >
                      <span className="min-w-0 truncate text-callout">{versionWho(version)}</span>
                      <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
                        {versionWhen(version)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
            {shown.list?.truncated && (
              <p
                data-testid="history-truncated"
                className="px-2 pt-2 text-caption text-muted-foreground"
              >
                {t.wikiPanes.history.truncated(DOC_HISTORY_LIMIT)}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
