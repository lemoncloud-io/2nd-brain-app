// 첫 질문 한 칸 — 계정·설치보다 먼저 무엇을 하려는지 묻는다. 답은 보관함이 생기기 전까지 설정에 두고,
// 보관함이 열리면 main 이 방향 문서(purpose.md)에 적어 커밋한다. 답하지 않고 넘어가도 된다.
import { useId, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ErrorNote } from '../error-note'
import { toUserError, type UserError } from '../../lib/user-error'
import { getT, useT } from '../../lib/i18n'

export const PurposeAsk = ({
  onDone
}: {
  /** 답을 저장했으면 그 답, 건너뛰었으면 null */
  onDone: (answer: string | null) => void
}): React.JSX.Element => {
  const t = useT()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<UserError | null>(null)
  const id = useId()

  const save = (): void => {
    setBusy(true)
    setError(null)
    window.api
      .setOnboardingPurpose(text)
      .then(onDone)
      .catch((e: unknown) => setError(toUserError(e, getT().vaultSetup.purposeSaveFailed)))
      .finally(() => setBusy(false))
  }

  return (
    <form
      data-testid="purpose-ask"
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim() !== '') save()
      }}
    >
      <label htmlFor={id} className="text-callout text-label">
        {t.onboarding.purposeQuestion}
      </label>
      <Input
        id={id}
        data-testid="purpose-answer"
        maxLength={300}
        value={text}
        placeholder={t.onboarding.purposePlaceholder}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-caption text-muted-foreground">{t.onboarding.purposeNote}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          type="submit"
          data-testid="purpose-save"
          disabled={busy || text.trim() === ''}
        >
          {t.vaultSetup.purposeSave} <ArrowRight aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          data-testid="purpose-skip"
          disabled={busy}
          onClick={() => onDone(null)}
        >
          {t.vaultSetup.purposeLater}
        </Button>
      </div>
      {error && <ErrorNote error={error} testId="purpose-error" />}
    </form>
  )
}
