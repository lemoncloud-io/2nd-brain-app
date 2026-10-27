import { Button } from './ui/button'
import { applyLanguage, useLanguage, useT } from '../lib/i18n'
import { cn } from '../lib/utils'
import { LANGUAGE_NAMES, LANGUAGES } from '../../../shared/language'

// 화면 언어 단추 한 줄 — 설정 > 화면과 첫 실행 시작하기가 같이 쓴다.
// 화면은 누르는 즉시 바꾸고, 기억(settings.json)에 남긴 결과만 부른 쪽에 알린다
export const LanguagePicker = ({
  testIdPrefix = 'language',
  onSaved,
  onSaveFailed,
  className
}: {
  testIdPrefix?: string
  onSaved: () => void
  onSaveFailed: (cause: unknown) => void
  className?: string
}): React.JSX.Element => {
  const t = useT()
  const language = useLanguage()
  return (
    <div
      role="group"
      aria-label={t.appearance.language}
      className={cn('flex flex-wrap gap-2', className)}
    >
      {LANGUAGES.map((value) => (
        <Button
          key={value}
          size="sm"
          variant={language === value ? 'default' : 'outline'}
          aria-pressed={language === value}
          lang={value}
          data-testid={`${testIdPrefix}-${value}`}
          onClick={() => {
            // main 이 먼저 — 바뀐 직후 다시 읽는 목록이 새 언어로 답을 받는다(요청은 보낸 순서대로 처리된다)
            window.api.setLanguage(value).then(onSaved, onSaveFailed)
            applyLanguage(value)
          }}
        >
          {LANGUAGE_NAMES[value]}
        </Button>
      ))}
    </div>
  )
}
