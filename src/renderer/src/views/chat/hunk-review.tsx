// 고친 곳 검토 — 채팅이 고친 파일 하나를 고친 곳으로 나눠 보이고, 곳마다 두거나 되돌린다.
// 두기는 파일을 건드리지 않는다(쓴 것은 이미 들어가 있다). 되돌리기는 그 곳만 답 전으로 돌리고 `undo:` 커밋을 남긴다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Undo2 } from 'lucide-react'
import type { ChangeHunk, HunkReview } from '../../../../shared/ipc-contract'
import { toUserError } from '../../lib/user-error'
import { useChat } from './chat-context'
import { getT, useT } from '../../lib/i18n'

/** 같은 곳을 두 번 묻지 않게 — 되돌린 뒤 번호가 당겨져도 내용으로 가린다.
 * 같은 내용이 두 곳이면 두 번 물어야 하므로, 둔 자리(내용+그때 차례)를 기억한다 */
const keyOf = (hunk: ChangeHunk): string =>
  `${hunk.removed.join('\n')}\u0000${hunk.added.join('\n')}`

const HunkList = ({
  rel,
  hunks,
  hash,
  kept,
  busy,
  error,
  onKeep,
  onReject
}: {
  rel: string
  hunks: ChangeHunk[]
  hash: string
  kept: Set<string>
  busy: boolean
  error: string | null
  onKeep: (hunk: ChangeHunk, occurrence: number) => void
  onReject: (index: number, hash: string) => void
}): React.JSX.Element => {
  const t = useT()
  const listRef = useRef<HTMLDivElement>(null)
  // 두기로 없앤 곳의 원래 번호 — 지운 뒤 초점을 이웃 곳으로 옮긴다
  const keptIndexRef = useRef<number | null>(null)

  const seen = new Map<string, number>()
  const open = hunks
    .map((hunk, index) => {
      const key = keyOf(hunk)
      const occurrence = seen.get(key) ?? 0
      seen.set(key, occurrence + 1)
      return { hunk, index, key, occurrence }
    })
    .filter(({ key, occurrence }) => !kept.has(`${key}#${occurrence}`))

  // 둔 곳이 DOM에서 사라지면 초점이 몸으로 떨어진다 — 다음 곳의 두기,
  // 없으면 이전 곳의 두기, 곳이 다 비었으면 끝 문장으로 옮긴다
  useEffect(() => {
    const gone = keptIndexRef.current
    if (gone === null) return
    keptIndexRef.current = null
    const rest = open.map(({ index }) => index).sort((a, b) => a - b)
    const target =
      rest.find((index) => index > gone) ?? [...rest].reverse().find((index) => index < gone)
    const el =
      target !== undefined
        ? listRef.current?.querySelector(`[data-testid="hunk-accept:${target}"]`)
        : listRef.current?.querySelector('[data-testid="hunk-done"]')
    ;(el as HTMLElement | null)?.focus()
  }, [kept, open])

  const keep = (index: number, hunk: ChangeHunk): void => {
    keptIndexRef.current = index
    const key = keyOf(hunk)
    let occurrence = 0
    for (let i = 0; i < index; i += 1) {
      if (hunks[i] !== undefined && keyOf(hunks[i]!) === key) occurrence += 1
    }
    onKeep(hunk, occurrence)
  }

  return (
    <div
      ref={listRef}
      className="flex flex-col gap-2 pb-1.5 pl-5"
      data-testid={`hunk-review:${rel}`}
    >
      {open.length === 0 && (
        <p
          tabIndex={-1}
          className="focus-ring rounded-sm text-caption text-muted-foreground"
          data-testid="hunk-done"
        >
          {t.chatView.hunk.done}
        </p>
      )}
      {open.map(({ hunk, index, key, occurrence }) => (
        <div
          key={`${key}#${occurrence}`}
          className="overflow-hidden rounded-md border border-hairline"
          data-testid={`hunk:${index}`}
        >
          <div className="flex items-center gap-2 border-b border-hairline bg-muted/40 px-2 py-1">
            <span className="text-micro text-muted-foreground">
              {t.chatView.hunk.line(hunk.line)}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className="focus-ring inline-flex items-center gap-1 rounded px-1.5 text-caption text-primary-ink hover:underline"
                data-testid={`hunk-accept:${index}`}
                disabled={busy}
                onClick={() => keep(index, hunk)}
              >
                <Check aria-hidden className="size-3" /> {t.chatView.hunk.keep}
              </button>
              <button
                type="button"
                className="focus-ring inline-flex items-center gap-1 rounded px-1.5 text-caption text-muted-foreground hover:text-foreground hover:underline"
                data-testid={`hunk-reject:${index}`}
                disabled={busy}
                onClick={() => onReject(index, hash)}
              >
                <Undo2 aria-hidden className="size-3" /> {t.chatView.hunk.undo}
              </button>
            </span>
          </div>
          <pre className="max-h-48 overflow-auto px-2 py-1 font-mono text-micro leading-relaxed whitespace-pre-wrap">
            {hunk.removed.map((line, i) => (
              <div key={`r${i}`} className="bg-destructive/10 text-foreground">
                <span aria-label={t.chatView.hunk.removed}>- </span>
                {line}
              </div>
            ))}
            {hunk.added.map((line, i) => (
              <div key={`a${i}`} className="bg-added/10 text-foreground">
                <span aria-label={t.chatView.hunk.added}>+ </span>
                {line}
              </div>
            ))}
          </pre>
        </div>
      ))}
      {error && (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export const HunkReviewPanel = ({
  changeId,
  rel
}: {
  changeId: string
  rel: string
}): React.JSX.Element => {
  const t = useT()
  const chat = useChat()
  const conversationId = chat.activeId
  const [review, setReview] = useState<HunkReview | null>(null)
  const [kept, setKept] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((): void => {
    if (!conversationId) return
    window.api
      .changeReview(conversationId, changeId, rel)
      .then(setReview)
      .catch((e: unknown) =>
        setReview({ unavailable: toUserError(e, getT().chatView.hunk.readFailed).text })
      )
  }, [conversationId, changeId, rel])

  useEffect(load, [load])

  const reject = (index: number, hash: string): void => {
    if (!conversationId || busy) return
    setBusy(true)
    setError(null)
    window.api
      .rejectChangeHunk(conversationId, changeId, rel, index, hash)
      .then((result) => {
        if (result.ok) {
          chat.applyChanges(result.changes)
          setReview(result.review)
          return
        }
        setError(result.reason)
        load()
      })
      .catch((e: unknown) => setError(toUserError(e, getT().chatView.hunk.undoFailed).text))
      .finally(() => setBusy(false))
  }

  if (review === null) {
    return <p className="py-1 pl-5 text-caption text-muted-foreground">{t.chatView.hunk.loading}</p>
  }
  if ('unavailable' in review) {
    return (
      <p className="py-1 pl-5 text-caption text-muted-foreground" data-testid="hunk-unavailable">
        {review.unavailable}
      </p>
    )
  }
  return (
    <HunkList
      rel={rel}
      hunks={review.hunks}
      hash={review.hash}
      kept={kept}
      busy={busy}
      error={error}
      onKeep={(hunk, occurrence) =>
        setKept((prev) => new Set(prev).add(`${keyOf(hunk)}#${occurrence}`))
      }
      onReject={reject}
    />
  )
}
