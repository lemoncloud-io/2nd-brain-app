import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '../ui/button'
import { useT } from '../../lib/i18n'

// 터미널에 붙여 넣을 한 줄 — 고정폭은 명령 자체라서 쓴다. 복사 뒤 2초 동안 복사됨을 알린다
export const CopyCommand = ({
  command,
  testId
}: {
  command: string
  testId?: string
}): React.JSX.Element => {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-well py-1.5 pr-1.5 pl-3">
      <code
        data-testid={testId}
        className="min-w-0 flex-1 font-mono text-caption wrap-anywhere text-foreground select-all scrollbar-thin"
      >
        {command}
      </code>
      <Button
        size="sm"
        variant="outline"
        aria-label={copied ? t.vaultSetup.copied : t.vaultSetup.copyCommand}
        onClick={() => {
          setFailed(false)
          navigator.clipboard
            .writeText(command)
            .then(() => setCopied(true))
            // 설치 안내 한복판이다 — 조용히 실패하면 사용자는 명령을 못 가져간 줄도 모른다
            .catch(() => setFailed(true))
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? t.vaultSetup.copied : t.vaultSetup.copy}
      </Button>
      {failed && (
        <p role="alert" className="text-caption text-destructive" data-testid="copy-failed">
          {t.vaultSetup.copyFailed}
        </p>
      )}
    </div>
  )
}
