import { useEffect, useId, useState } from 'react'
import { isValidModelName, type EngineSettings } from '../../../shared/engine-settings'
import { SettingsSection } from '../components/layout/settings-section'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { announceEngineSettings, onEngineSettingsChanged } from '../lib/engine-settings-sync'
import { toUserError } from '../lib/user-error'
import { getT, useT } from '../lib/i18n'
import { ENGINE_NAME } from '../lib/install-guide'

// 고급 → 모델 직접 입력 — 목록에 없는 새 모델·Codex 모델 이름. 지금 고른 엔진에 그 모델 하나로 저장한다.
// 비워 저장하면 기본 모델로 돌아간다. 기본 화면의 'AI 설정' 이 저장한 엔진·모델을 따라 다시 읽는다.
const ModelCustomField = (): React.JSX.Element => {
  const t = useT()
  const [settings, setSettings] = useState<EngineSettings | null>(null)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const hintId = useId()
  const errorId = useId()

  useEffect(() => {
    const load = (): void => {
      window.api
        .getEngineSettings()
        .then((loaded) => {
          setSettings(loaded)
          setDraft(loaded.model ?? '')
        })
        .catch((err: unknown) =>
          setStatus({ ok: false, text: toUserError(err, getT().settings.aiReadFailed).text })
        )
    }
    load()
    return onEngineSettingsChanged(load)
  }, [])

  const trimmed = draft.trim()
  const invalid = trimmed !== '' && !isValidModelName(trimmed)

  const save = (): void => {
    if (!settings) return
    window.api
      .setEngineSettings({
        engine: settings.engine,
        model: trimmed || undefined,
        draftModel: settings.draftModel
      })
      .then((next) => {
        setSettings(next)
        setDraft(next.model ?? '')
        setStatus({ ok: true, text: getT().settings.saved })
        announceEngineSettings()
      })
      .catch((err: unknown) =>
        setStatus({ ok: false, text: toUserError(err, getT().settings.aiSaveFailed).text })
      )
  }

  return (
    <SettingsSection title={t.settings.customModel.title}>
      <p id={hintId} className="text-caption text-muted-foreground">
        {t.settings.customModel.hint(settings ? ENGINE_NAME[settings.engine] : t.settings.anyAi)}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Input
          type="text"
          data-testid="engine-model-custom"
          aria-label={t.settings.customModel.label}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : hintId}
          disabled={!settings}
          value={draft}
          placeholder={t.settings.customModel.placeholder}
          onChange={(e) => {
            setDraft(e.target.value)
            setStatus(null)
          }}
          className="flex-1 aria-invalid:border-destructive"
        />
        <Button
          size="sm"
          data-testid="engine-model-custom-save"
          disabled={!settings || invalid}
          onClick={save}
        >
          {t.settings.save}
        </Button>
      </div>
      {invalid && (
        <p
          id={errorId}
          className="text-caption text-destructive mt-2"
          role="alert"
          data-testid="engine-model-custom-invalid"
        >
          {t.settings.badModelName}
        </p>
      )}
      {status && (
        <p
          data-testid="engine-model-custom-status"
          role={status.ok ? undefined : 'alert'}
          className={`text-caption mt-2 ${status.ok ? 'text-muted-foreground' : 'text-destructive'}`}
        >
          {status.text}
        </p>
      )}
    </SettingsSection>
  )
}

export default ModelCustomField
