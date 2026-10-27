// 복사 단추 — 누르면 잠깐 체크로 바뀌었다가 돌아온다. 실패도 알린다: 조용히 실패하면 사용자는
// 못 가져간 줄도 모른다(components/start/copy-command.tsx 와 같은 이유)
import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '../lib/utils'
import { useT } from '../lib/i18n'

const RESET_MS = 1500

export const CopyButton = ({
  text,
  label,
  testId,
  className
}: {
  text: string
  label: string
  testId: string
  className?: string
}): React.JSX.Element => {
  const t = useT()
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = setTimeout(() => setState('idle'), RESET_MS)
    return () => clearTimeout(timer)
  }, [state])

  return (
    <button
      type="button"
      aria-label={state === 'copied' ? t.shell.copied : label}
      title={state === 'failed' ? t.shell.copyFailed : label}
      data-testid={testId}
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => setState('copied'))
          .catch(() => setState('failed'))
      }}
      className={cn(className, state === 'failed' && 'text-destructive')}
    >
      {state === 'copied' ? (
        <Check aria-hidden className="animate-in zoom-in-50 fade-in duration-200" />
      ) : (
        <Copy aria-hidden />
      )}
    </button>
  )
}
