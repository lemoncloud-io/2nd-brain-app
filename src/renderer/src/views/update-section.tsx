// 설정 — 앱 업데이트. 지금 버전과 새 버전 상태 한 줄, 받아 두었으면 다시 시작 버튼.
import { useEffect, useState } from 'react'
import { RefreshCw, RotateCw } from 'lucide-react'
import { BrandMark } from '../components/brand-mark'
import { SettingsSection, StatusDot } from '../components/layout/settings-section'
import { Button } from '../components/ui/button'
import { useUpdate } from '../hooks/use-update'
import { updateLine } from '../lib/update-text'
import { useT } from '../lib/i18n'

const UpdateSection = (): React.JSX.Element => {
  const t = useT()
  const { state, restarting, restart, check } = useUpdate()
  // undefined = 아직 읽는 중, null = 읽지 못함(버전 없이 상태만 보인다)
  const [version, setVersion] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    window.api
      .getAppInfo()
      .then((info) => setVersion(info.version))
      .catch((error: unknown) => {
        console.error(error)
        setVersion(null)
      })
  }, [])

  const line = state && version !== undefined ? updateLine(state, version) : null

  return (
    <SettingsSection title={t.settings.update.title}>
      {line ? (
        <div className="flex flex-col gap-2" data-testid="update-section" data-state={state?.kind}>
          <div className="flex items-center gap-2">
            <BrandMark size={20} />
            <span className="text-callout font-medium">2nd-brain</span>
          </div>
          <div className="flex items-start gap-2">
            <StatusDot tone={line.tone} />
            <p className="text-body" data-testid="update-line">
              {line.text}
            </p>
          </div>
          {line.detail && (
            <details className="text-caption text-muted-foreground">
              <summary className="cursor-pointer">{t.shell.details}</summary>
              <pre className="mt-1 whitespace-pre-wrap break-all">{line.detail}</pre>
            </details>
          )}
          {line.action === 'check' && (
            <div>
              <Button variant="outline" size="sm" data-testid="update-check" onClick={check}>
                <RefreshCw aria-hidden /> {t.shell.recheck}
              </Button>
            </div>
          )}
          {line.action === 'restart' && (
            <div>
              <Button
                size="sm"
                data-testid="update-restart"
                disabled={restarting}
                onClick={restart}
              >
                <RotateCw aria-hidden />{' '}
                {restarting ? t.shell.restarting : t.settings.update.restart}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-caption text-muted-foreground">{t.shell.loading}</p>
      )}
    </SettingsSection>
  )
}

export default UpdateSection
