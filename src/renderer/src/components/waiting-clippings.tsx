// 위키화를 기다리는 자료 목록 — 옆 칸 위키화 탭과 지식 관리의 자료 구역이 같이 쓴다.
// 수만 말하면 무엇이 들어갈지 몰라 시작을 누르지 못한다. 누르면 가운데에서 그 자료를 읽는다.
// 자료 구역에서는 잘못 넣은 것을 그 자리에서 뺀다(`removable`) — 트리까지 찾아가지 않게.
import { useState } from 'react'
import { FileText, Trash2 } from 'lucide-react'
import type { Clipping } from '../lib/clippings'
import { toUserError } from '../lib/user-error'
import { useWorkbench } from '../store/workbench'
import { TrashDialog } from './tree/tree-entry-menu'
import { getLocale, getT, useT } from '../lib/i18n'

const dayLabel = (mtimeMs: number): string =>
  new Date(mtimeMs).toLocaleDateString(getLocale(), { month: 'long', day: 'numeric' })

export const WaitingClippings = ({
  items,
  testId,
  removable = false
}: {
  items: Clipping[]
  /** 행은 `<testId>:<rel>`, 빼기 버튼은 `<testId>-trash:<rel>` 이다 */
  testId: string
  removable?: boolean
}): React.JSX.Element => {
  const t = useT()
  const openFile = useWorkbench((s) => s.openFile)
  const relocated = useWorkbench((s) => s.relocated)
  const [target, setTarget] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const trash = (rel: string): void => {
    setTarget(null)
    setError(null)
    window.api
      .trashVaultEntry(rel)
      .then((result) => {
        if ('error' in result) setError(result.error)
        else relocated(rel, null)
      })
      .catch((e: unknown) => setError(toUserError(e, getT().files.trashFailed).text))
  }

  return (
    <>
      <ul data-testid={testId} aria-label={t.files.waitingLabel} className="flex flex-col gap-px">
        {items.map((clip) => (
          <li key={clip.rel} className="group flex items-center gap-1">
            <button
              type="button"
              data-testid={`${testId}:${clip.rel}`}
              title={t.files.waitingOpen(clip.rel)}
              onClick={() => openFile(clip.rel)}
              className="focus-ring flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-callout text-foreground hover:bg-accent"
            >
              <FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{clip.name}</span>
              {clip.tag && (
                <span className="shrink-0 rounded-sm bg-accent px-1 text-caption leading-4 text-muted-foreground">
                  {clip.tag}
                </span>
              )}
              <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
                {dayLabel(clip.mtimeMs)}
              </span>
            </button>
            {removable && (
              <button
                type="button"
                data-testid={`${testId}-trash:${clip.rel}`}
                aria-label={t.files.waitingRemove(clip.name)}
                title={t.files.waitingRemoveHint}
                onClick={() => setTarget(clip.rel)}
                className="focus-ring grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-destructive focus-visible:opacity-100"
              >
                <Trash2 aria-hidden className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
      {removable && (
        <TrashDialog
          target={target === null ? null : { rel: target, dir: false }}
          onClose={() => setTarget(null)}
          onConfirm={trash}
        />
      )}
    </>
  )
}
