import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { useT } from '../../lib/i18n'

type Props = {
  query: string
  onQueryChange: (query: string) => void
  /** 일치 수와 지금 자리(0부터). total 0 이면 at 은 무시 */
  total: number
  at: number
  onStep: (delta: 1 | -1) => void
  onClose: () => void
}

// 리더 찾기 띠 — 본문 위에 한 줄. Enter 다음, Shift+Enter 이전, Esc 닫기.
// 한글 조합 중에는 질의를 올리지 않는다 — 글자마다 다시 세면 조합이 깨진 채로 센다
export const FindBar = ({
  query,
  onQueryChange,
  total,
  at,
  onStep,
  onClose
}: Props): React.JSX.Element => {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(query)
  const composing = useRef(false)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  const commit = (value: string): void => {
    setDraft(value)
    if (!composing.current) onQueryChange(value)
  }
  return (
    <div
      role="search"
      data-testid="wiki-find"
      className="flex shrink-0 items-center gap-2 border-b border-hairline bg-elevated px-4 py-1.5 text-caption"
    >
      <Input
        ref={inputRef}
        type="text"
        aria-label={t.wikiDoc.find.input}
        placeholder={t.wikiDoc.find.placeholder}
        value={draft}
        onChange={(e) => commit(e.target.value)}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={(e) => {
          composing.current = false
          onQueryChange(e.currentTarget.value)
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') {
            e.preventDefault()
            onStep(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        className="h-7 w-56 px-2 text-label"
      />
      <span
        data-testid="wiki-find-count"
        aria-live="polite"
        className="tabular-nums text-muted-foreground"
      >
        {total === 0 ? '0/0' : `${at + 1}/${total}`}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={t.wikiDoc.find.previous}
        title={t.wikiDoc.find.previousHint}
        disabled={total === 0}
        onClick={() => onStep(-1)}
      >
        <ChevronUp aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={t.wikiDoc.find.next}
        title={t.wikiDoc.find.nextHint}
        disabled={total === 0}
        onClick={() => onStep(1)}
      >
        <ChevronDown aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={t.wikiDoc.find.close}
        title={t.wikiDoc.find.closeHint}
        onClick={onClose}
      >
        <X aria-hidden />
      </Button>
    </div>
  )
}
