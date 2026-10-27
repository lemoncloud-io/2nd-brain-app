import { useEffect, useId, useState } from 'react'
import { isValidModelName, type EngineSettings } from '../../../shared/engine-settings'
import { SettingsSection } from '../components/layout/settings-section'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { announceEngineSettings, onEngineSettingsChanged } from '../lib/engine-settings-sync'
import { toUserError } from '../lib/user-error'
import { getT, useT } from '../lib/i18n'
import { ENGINE_NAME } from '../lib/install-guide'

// 고급 → 위키 초안 모델 — 위키 초안 만들기에만 쓰는 다른 모델. 비워 저장하면 위의 모델과 같아진다.
// 승인에서 사람이 고르므로 초안은 싸고 빠른 모델로 돌릴 수 있다. 엔진이 바뀌면 비운다 — Claude 별칭을 Codex 가 모른다.
const DraftModelField = (): React.JSX.Element => {
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
          setDraft(loaded.draftModel ?? '')
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
        model: settings.model,
        draftModel: trimmed || undefined
      })
      .then((next) => {
        setSettings(next)
        setDraft(next.draftModel ?? '')
        setStatus({ ok: true, text: getT().settings.saved })
        announceEngineSettings()
      })
      .catch((err: unknown) =>
        setStatus({ ok: false, text: toUserError(err, getT().settings.aiSaveFailed).text })
      )
  }

  return (
    <SettingsSection title={t.settings.draftModel.title}>
      <p id={hintId} className="text-caption text-muted-foreground">
        {t.settings.draftModel.hint(settings ? ENGINE_NAME[settings.engine] : t.settings.anyAi)}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Input
          type="text"
          data-testid="engine-draft-model"
          aria-label={t.settings.draftModel.label}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : hintId}
          disabled={!settings}
          value={draft}
          placeholder={t.settings.draftModel.placeholder}
          onChange={(e) => {
            setDraft(e.target.value)
            setStatus(null)
          }}
          className="flex-1 aria-invalid:border-destructive"
        />
        <Button
          size="sm"
          data-testid="engine-draft-model-save"
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
          data-testid="engine-draft-model-invalid"
        >
          {t.settings.badModelName}
        </p>
      )}
      {status && (
        <p
          data-testid="engine-draft-model-status"
          role={status.ok ? undefined : 'alert'}
          className={`text-caption mt-2 ${status.ok ? 'text-muted-foreground' : 'text-destructive'}`}
        >
          {status.text}
        </p>
      )}
    </SettingsSection>
  )
}

export default DraftModelField
