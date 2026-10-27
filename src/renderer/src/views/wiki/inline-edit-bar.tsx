// 고른 글 AI 로 고치기 — 지시를 받아 제안 하나를 받고, 지금 글과 고친 글을 나란히 보인 뒤 넣거나 버린다.
// 넣기는 편집기 안의 편집일 뿐이다(⌘Z 로 빠진다) — 저장해야 `edit:` 커밋이 된다.
import { useState } from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { ErrorNote } from '../../components/error-note'
import { toUserError, type UserError } from '../../lib/user-error'
import { getT, useT } from '../../lib/i18n'

export type EditTarget = { from: number; to: number; selection: string }

type Phase =
  | { kind: 'ask' }
  | { kind: 'running' }
  | { kind: 'proposal'; text: string }
  | { kind: 'error'; error: UserError }

export const InlineEditBar = ({
  rel,
  target,
  docText,
  onAccept,
  onClose
}: {
  rel: string
  target: EditTarget
  /** 제안을 부를 때의 문서 전체 — 앞뒤 맥락을 여기서 자른다 */
  docText: () => string
  onAccept: (text: string) => void
  onClose: () => void
}): React.JSX.Element => {
  const t = useT()
  const [instruction, setInstruction] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'ask' })

  const run = (): void => {
    if (instruction.trim() === '' || phase.kind === 'running') return
    const doc = docText()
    setPhase({ kind: 'running' })
    window.api
      .inlineEdit({
        rel,
        before: doc.slice(0, target.from),
        selection: target.selection,
        after: doc.slice(target.to),
        instruction
      })
      .then((result) =>
        setPhase(
          'error' in result
            ? { kind: 'error', error: toUserError(result.error, getT().wikiDoc.aiEdit.failed) }
            : { kind: 'proposal', text: result.text }
        )
      )
      .catch((e: unknown) =>
        setPhase({ kind: 'error', error: toUserError(e, getT().wikiDoc.aiEdit.failed) })
      )
  }

  const close = (): void => {
    if (phase.kind === 'running') void window.api.cancelInlineEdit()
    onClose()
  }

  return (
    <div
      className="flex flex-col gap-2 border-b border-hairline bg-muted/30 px-6 py-2"
      data-testid="ai-edit-bar"
      // 편집기의 Esc(편집 취소)까지 올라가지 않게 — 이 칸만 닫는다
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.nativeEvent.isComposing) return
        e.stopPropagation()
        close()
      }}
    >
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          aria-label={t.wikiDoc.aiEdit.instruction}
          data-testid="ai-edit-instruction"
          value={instruction}
          disabled={phase.kind === 'running'}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
            e.preventDefault()
            run()
          }}
          placeholder={t.wikiDoc.aiEdit.placeholder}
          className="focus-ring min-w-0 flex-1 rounded-md border border-hairline bg-background px-2 py-1 text-callout"
        />
        <Button
          size="sm"
          data-testid="ai-edit-run"
          disabled={instruction.trim() === '' || phase.kind === 'running'}
          onClick={run}
        >
          {phase.kind === 'running'
            ? t.wikiDoc.aiEdit.running
            : phase.kind === 'ask'
              ? t.wikiDoc.aiEdit.run
              : t.wikiDoc.aiEdit.again}
        </Button>
        <Button variant="ghost" size="sm" data-testid="ai-edit-close" onClick={close}>
          {phase.kind === 'running' ? t.wikiDoc.aiEdit.stop : t.wikiDoc.aiEdit.close}
        </Button>
      </div>
      {phase.kind === 'error' && <ErrorNote error={phase.error} testId="ai-edit-error" />}
      {phase.kind === 'proposal' && (
        // 초점은 입력칸에 둔 채로 둔다 — 도착만 알리고 손은 뺏지 않는다
        <div role="status" className="flex flex-col gap-1.5" data-testid="ai-edit-proposal">
          <div className="grid gap-1.5 md:grid-cols-2">
            <section
              aria-label={t.wikiDoc.aiEdit.before}
              className="min-w-0 rounded-md border border-hairline"
            >
              <p className="border-b border-hairline px-2 py-0.5 text-micro text-muted-foreground">
                {t.wikiDoc.aiEdit.before}
              </p>
              <pre className="max-h-40 overflow-auto bg-destructive/10 px-2 py-1 font-mono text-micro whitespace-pre-wrap">
                {target.selection}
              </pre>
            </section>
            <section
              aria-label={t.wikiDoc.aiEdit.after}
              className="min-w-0 rounded-md border border-hairline"
            >
              <p className="border-b border-hairline px-2 py-0.5 text-micro text-muted-foreground">
                {t.wikiDoc.aiEdit.after}
              </p>
              <pre
                className="max-h-40 overflow-auto bg-added/10 px-2 py-1 font-mono text-micro whitespace-pre-wrap"
                data-testid="ai-edit-proposal-text"
              >
                {phase.text}
              </pre>
            </section>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" data-testid="ai-edit-accept" onClick={() => onAccept(phase.text)}>
              <Check aria-hidden /> {t.wikiDoc.aiEdit.accept}
            </Button>
            <Button variant="ghost" size="sm" data-testid="ai-edit-reject" onClick={close}>
              <X aria-hidden /> {t.wikiDoc.aiEdit.reject}
            </Button>
            <span className="text-caption text-muted-foreground">{t.wikiDoc.aiEdit.undoHint}</span>
          </div>
        </div>
      )}
    </div>
  )
}
