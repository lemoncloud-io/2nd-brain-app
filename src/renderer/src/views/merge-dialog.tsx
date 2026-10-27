// 중복 페이지 합치기 — AI 점검이 같은 개념이라고 짚은 두 페이지. 합친 글 제안을 두 원문 옆에 보이고,
// 링크를 고칠 문서와 지울 페이지를 알린 뒤 사람이 받으면 합친다. 합친 직후에는 되돌리기를 준다.
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { MergeProposal } from '../../../shared/ipc-contract'
import { bodyOf, pageName } from '../../../shared/wiki/merge-pages'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle
} from '../components/ui/alert-dialog'
import { Button } from '../components/ui/button'
import { ErrorNote } from '../components/error-note'
import { formatElapsed } from '../lib/elapsed'
import { useElapsed } from '../hooks/use-elapsed'
import { toUserError, type UserError } from '../lib/user-error'
import { useWorkbench } from '../store/workbench'
import { getT, useT } from '../lib/i18n'

type Phase =
  | { at: 'proposing' }
  | { at: 'failed'; error: UserError }
  | { at: 'proposal'; proposal: MergeProposal; error: UserError | null; applying: boolean }
  | { at: 'merged'; proposal: MergeProposal; commit: string; edited: number; undoing: boolean }
  | { at: 'undone'; proposal: MergeProposal }

/** 링크를 고칠 문서 — 몇 개만 이름으로, 나머지는 수로. 전체 경로는 툴팁에 */
const SHOWN_EDITS = 3

const Original = ({
  label,
  path,
  text,
  testId
}: {
  label: string
  path?: string
  text: string
  testId: string
}): React.JSX.Element => (
  <div className="flex min-h-0 min-w-0 flex-col gap-1">
    <p className="text-caption text-muted-foreground truncate" title={path}>
      {label}
    </p>
    <pre
      data-testid={testId}
      aria-label={label}
      tabIndex={0}
      className="scrollbar-thin h-[30vh] overflow-auto rounded-md border border-hairline p-2 font-mono text-caption whitespace-pre-wrap wrap-anywhere md:h-[50vh]"
    >
      {text}
    </pre>
  </div>
)

export const MergeDialog = ({
  rels,
  onClose
}: {
  /** AI 점검이 짚은 두 페이지 — 어느 쪽을 남길지는 main 이 고른다 */
  rels: [string, string]
  /** merged — 합친 채로 닫혔다(되돌렸으면 false) */
  onClose: (merged: boolean) => void
}): React.JSX.Element => {
  const t = useT()
  const [phase, setPhase] = useState<Phase>({ at: 'proposing' })
  const elapsed = useElapsed(phase.at === 'proposing')
  const [undoError, setUndoError] = useState<UserError | null>(null)
  const navigate = useWorkbench((s) => s.navigate)

  useEffect(() => {
    let stale = false
    window.api
      .mergePropose(rels[0], rels[1])
      .then((result) => {
        if ('error' in result) throw result.error
        if (!stale) setPhase({ at: 'proposal', proposal: result, error: null, applying: false })
      })
      .catch((error: unknown) => {
        console.error('could not get a merge proposal', error)
        if (!stale) {
          setPhase({ at: 'failed', error: toUserError(error, getT().lintView.merge.proposeFailed) })
        }
      })
    return () => {
      stale = true
    }
  }, [rels])

  // 합치는 중에는 닫지 않는다 — 닫아도 합치기는 끝까지 가는데 결과와 되돌리기가 사라진다
  const busy =
    (phase.at === 'proposal' && phase.applying) || (phase.at === 'merged' && phase.undoing)
  const close = (): void => {
    if (busy) return
    if (phase.at === 'proposing') void window.api.mergeCancel()
    onClose(phase.at === 'merged')
  }

  const apply = (proposal: MergeProposal): void => {
    setPhase({ at: 'proposal', proposal, error: null, applying: true })
    window.api
      .mergeApply({
        keep: proposal.keep.rel,
        drop: proposal.drop.rel,
        body: proposal.body,
        keepHash: proposal.keep.hash,
        dropHash: proposal.drop.hash
      })
      .then((result) => {
        if ('error' in result) throw result.error
        setPhase({
          at: 'merged',
          proposal,
          commit: result.commit,
          edited: result.edited,
          undoing: false
        })
      })
      .catch((error: unknown) => {
        console.error('merge failed', error)
        setPhase({
          at: 'proposal',
          proposal,
          error: toUserError(error, getT().lintView.merge.applyFailed),
          applying: false
        })
      })
  }

  const undo = (proposal: MergeProposal, commit: string, edited: number): void => {
    setUndoError(null)
    setPhase({ at: 'merged', proposal, commit, edited, undoing: true })
    window.api
      .mergeUndo(commit)
      .then((result) => {
        if ('error' in result) throw result.error
        setPhase({ at: 'undone', proposal })
      })
      .catch((error: unknown) => {
        console.error('could not undo the merge', error)
        setUndoError(toUserError(error, getT().lintView.merge.undoFailed))
        setPhase({ at: 'merged', proposal, commit, edited, undoing: false })
      })
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && close()}>
      <AlertDialogContent
        className="max-h-[calc(100vh-2rem)] max-w-5xl overflow-y-auto"
        data-testid="merge-dialog"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <AlertDialogTitle>{t.lintView.merge.title}</AlertDialogTitle>
        {phase.at === 'proposing' && (
          <AlertDialogDescription className="flex items-center gap-2" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t.lintView.merge.proposing} {t.common.passed(formatElapsed(elapsed))}
          </AlertDialogDescription>
        )}
        {phase.at === 'failed' && <ErrorNote error={phase.error} testId="merge-error" />}
        {phase.at === 'proposal' && (
          <>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-1" data-testid="merge-summary">
                <p>
                  {t.lintView.merge.summary(phase.proposal.keep.title, phase.proposal.drop.title)}
                </p>
                {phase.proposal.edits.length === 0 ? (
                  <p>{t.lintView.merge.noEdits}</p>
                ) : (
                  <p title={phase.proposal.edits.map((edit) => edit.rel).join('\n')}>
                    {t.lintView.merge.edits}{' '}
                    {phase.proposal.edits
                      .slice(0, SHOWN_EDITS)
                      .map((edit) => t.lintView.merge.edit(pageName(edit.rel), edit.count))
                      .join(', ')}
                    {phase.proposal.edits.length > SHOWN_EDITS
                      ? t.lintView.merge.moreEdits(phase.proposal.edits.length - SHOWN_EDITS)
                      : ''}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
            <div className="grid min-h-0 grid-cols-1 gap-3 md:grid-cols-3">
              <Original
                label={t.lintView.merge.body}
                text={phase.proposal.body}
                testId="merge-body"
              />
              <Original
                label={t.lintView.merge.keep(phase.proposal.keep.title)}
                path={phase.proposal.keep.rel}
                text={bodyOf(phase.proposal.keep.text)}
                testId="merge-keep"
              />
              <Original
                label={t.lintView.merge.drop(phase.proposal.drop.title)}
                path={phase.proposal.drop.rel}
                text={bodyOf(phase.proposal.drop.text)}
                testId="merge-drop"
              />
            </div>
            {phase.error && <ErrorNote error={phase.error} testId="merge-apply-error" />}
          </>
        )}
        {phase.at === 'merged' && (
          <AlertDialogDescription data-testid="merge-done" role="status">
            {t.lintView.merge.merged(
              phase.proposal.keep.title,
              phase.proposal.drop.title,
              phase.edited
            )}
          </AlertDialogDescription>
        )}
        {phase.at === 'undone' && (
          <AlertDialogDescription data-testid="merge-undone" role="status">
            {t.lintView.merge.undone}
          </AlertDialogDescription>
        )}
        {undoError && <ErrorNote error={undoError} testId="merge-undo-error" />}
        <AlertDialogFooter>
          {phase.at === 'proposal' && (
            <>
              <AlertDialogCancel autoFocus disabled={phase.applying}>
                {t.lintView.merge.dismiss}
              </AlertDialogCancel>
              <Button
                size="sm"
                data-testid="merge-accept"
                disabled={phase.applying}
                onClick={() => apply(phase.proposal)}
              >
                {phase.applying && <Loader2 className="animate-spin" aria-hidden />}
                {phase.applying ? t.lintView.merge.applying : t.lintView.merge.apply}
              </Button>
            </>
          )}
          {phase.at === 'merged' && (
            <>
              <Button
                variant="outline"
                size="sm"
                data-testid="merge-undo"
                disabled={phase.undoing}
                onClick={() => undo(phase.proposal, phase.commit, phase.edited)}
              >
                {phase.undoing ? t.lintView.merge.undoing : t.lintView.merge.undo}
              </Button>
              <Button
                size="sm"
                autoFocus
                data-testid="merge-open"
                disabled={phase.undoing}
                onClick={() => {
                  navigate(phase.proposal.keep.rel)
                  onClose(true)
                }}
              >
                {t.lintView.merge.open}
              </Button>
            </>
          )}
          {(phase.at === 'proposing' || phase.at === 'failed' || phase.at === 'undone') && (
            <AlertDialogCancel data-testid="merge-close">
              {phase.at === 'proposing' ? t.lintView.merge.stop : t.lintView.merge.close}
            </AlertDialogCancel>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
