// 변경 카드 — 채팅 답 하나가 보관함에 만들고 고친 파일, 막은 것, 되돌리기. 답 아래에 붙는다.
import { useState } from 'react'
import { FilePen, FilePlus2, RotateCcw, ShieldAlert } from 'lucide-react'
import type { ChangeFile, ChangeSet } from '../../../../shared/ipc-contract'
import { Button } from '../../components/ui/button'
import { folderLabel } from '../../lib/vault-path'
import { useWorkbench } from '../../store/workbench'
import { useChat } from './chat-context'
import { HunkReviewPanel } from './hunk-review'
import { useT } from '../../lib/i18n'

const FileRow = ({
  file,
  changeId,
  reviewable
}: {
  file: ChangeFile
  changeId: string
  /** 고친 곳별로 볼 수 있는 카드 — 되돌리지 않았고 기록이 남아 있다 */
  reviewable: boolean
}): React.JSX.Element => {
  const t = useT()
  const showChanges = useWorkbench((s) => s.showChanges)
  const openFile = useWorkbench((s) => s.openFile)
  const [reviewing, setReviewing] = useState(false)
  const Icon = file.kind === 'created' ? FilePlus2 : FilePen
  const gone = file.state === 'undone' && file.kind === 'created'
  const canReview = reviewable && !file.state
  return (
    <li className="py-1" data-testid={`change-file:${file.rel}`}>
      <div className="flex min-w-0 items-center gap-2">
        <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-caption text-muted-foreground">
          {file.kind === 'created' ? t.chatView.change.created : t.chatView.change.edited}
        </span>
        <span className="min-w-0 truncate text-caption text-label" title={file.rel}>
          {folderLabel(file.rel)}
        </span>
        {file.state && (
          <span
            className="shrink-0 text-caption text-muted-foreground"
            data-testid={`change-state:${file.rel}`}
          >
            · {t.chatView.change.state[file.state]}
          </span>
        )}
        {!gone && (
          <span className="ml-auto flex shrink-0 items-center">
            {canReview && (
              <button
                type="button"
                className="focus-ring rounded px-1.5 text-caption text-primary-ink hover:underline"
                data-testid={`change-review:${file.rel}`}
                aria-expanded={reviewing}
                onClick={() => setReviewing((v) => !v)}
              >
                {reviewing ? t.chatView.change.reviewClose : t.chatView.change.review}
              </button>
            )}
            <button
              type="button"
              className="focus-ring rounded px-1.5 text-caption text-primary-ink hover:underline"
              data-testid={`change-marks:${file.rel}`}
              onClick={() => showChanges(file.rel, changeId)}
            >
              {t.chatView.change.marks}
            </button>
            <button
              type="button"
              className="focus-ring rounded px-1.5 text-caption text-primary-ink hover:underline"
              data-testid={`change-open:${file.rel}`}
              onClick={() => openFile(file.rel)}
            >
              {t.chatView.change.open}
            </button>
          </span>
        )}
      </div>
      {reviewing && canReview && <HunkReviewPanel changeId={changeId} rel={file.rel} />}
    </li>
  )
}

export const ChangeCard = ({ changes }: { changes: ChangeSet }): React.JSX.Element => {
  const t = useT()
  const chat = useChat()
  const undoing = chat.undoing === changes.id
  const error = chat.undoError?.id === changes.id ? chat.undoError.text : null
  const canUndo = changes.files.length > 0 && !changes.undone && !changes.pruned
  return (
    <section
      className="flex flex-col gap-1.5 rounded-lg border border-hairline px-3 py-2.5"
      data-testid="change-card"
      aria-label={t.chatView.change.label}
    >
      {changes.interrupted && (
        <p className="text-caption text-muted-foreground" data-testid="change-interrupted">
          {t.chatView.change.interrupted}
        </p>
      )}
      {changes.files.length > 0 && (
        <ul className="flex flex-col divide-y divide-hairline">
          {changes.files.map((file) => (
            <FileRow
              key={file.rel}
              file={file}
              changeId={changes.id}
              reviewable={!changes.undone && !changes.pruned}
            />
          ))}
        </ul>
      )}
      {changes.blocked.length > 0 && (
        <ul className="flex flex-col gap-0.5" data-testid="change-blocked">
          {changes.blocked.map((line) => (
            <li key={line} className="flex min-w-0 items-start gap-2 text-caption text-label">
              <ShieldAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <span className="min-w-0 wrap-anywhere">{line}</span>
            </li>
          ))}
        </ul>
      )}
      {(canUndo || changes.pruned || changes.undone || error) && (
        <div className="-ml-2 flex flex-wrap items-center gap-2">
          {canUndo && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-caption text-muted-foreground"
              data-testid="change-undo"
              disabled={undoing}
              onClick={() => chat.undoChange(changes.id)}
            >
              <RotateCcw aria-hidden />{' '}
              {undoing ? t.chatView.change.undoing : t.chatView.change.undo}
            </Button>
          )}
          {changes.undone && (
            <span className="pl-2 text-caption text-muted-foreground" data-testid="change-undone">
              {changes.files.some((f) => f.state === 'undone')
                ? t.chatView.change.undone
                : t.chatView.change.nothingUndone}
            </span>
          )}
          {changes.pruned && !changes.undone && (
            <span className="pl-2 text-caption text-muted-foreground" data-testid="change-pruned">
              {t.chatView.change.pruned}
            </span>
          )}
          {error && (
            <span className="pl-2 text-caption text-destructive" role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    </section>
  )
}
