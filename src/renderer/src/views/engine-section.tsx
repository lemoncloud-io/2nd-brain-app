import { useCallback, useEffect, useId, useState } from 'react'
import {
  CLAUDE_MODEL_ALIASES,
  ENGINE_KINDS,
  isListedModel,
  type EngineKind,
  type EngineSettings
} from '../../../shared/engine-settings'
import { SettingsSection } from '../components/layout/settings-section'
import { useSetup } from '../hooks/use-setup'
import { Button } from '../components/ui/button'
import {
  announceEngineSettings,
  onEngineSettingsChanged,
  switchEngine
} from '../lib/engine-settings-sync'
import { toUserError } from '../lib/user-error'
import { getT, useT } from '../lib/i18n'
import { ENGINE_NAME } from '../lib/install-guide'

const readFailed = (err: unknown): string => toUserError(err, getT().settings.aiReadFailed).text
const saveFailed = (err: unknown): string => toUserError(err, getT().settings.aiSaveFailed).text

// 설정 → AI 설정 — 엔진 CLI 와 모델 하나. 채팅·위키화·AI 점검이 모두 이 모델을 쓴다.
// 위키 초안만 고급의 draftModel 로 따로 둘 수 있다(없으면 이 모델).
// 목록에 없는 이름(새 모델·Codex 모델)은 설정 맨 아래 '고급' 에서 넣는다 — 여기서는 그 이름을 보여 주기만 한다.
const EngineSection = (): React.JSX.Element => {
  const t = useT()
  const [settings, setSettings] = useState<EngineSettings | null>(null)
  const [engine, setEngine] = useState<EngineKind>('claude')
  const [model, setModel] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const modelId = useId()
  // 엔진을 바꿔 저장하면 위의 "AI 연결" 이 가리키는 대상도 바뀐다 — 같이 다시 읽지 않으면 이전 엔진의 상태가 남는다
  const { refresh } = useSetup()

  // 저장된 값을 다시 읽어 화면에 맞춘다 — 다른 칸이 저장했을 때, 내 저장이 실패했을 때
  const load = useCallback((): void => {
    window.api
      .getEngineSettings()
      .then((loaded) => {
        setSettings(loaded)
        setEngine(loaded.engine)
        setModel(loaded.model ?? '')
      })
      .catch((err: unknown) => setStatus({ ok: false, text: readFailed(err) }))
  }, [])

  useEffect(() => {
    load()
    return onEngineSettingsChanged(load)
  }, [load])

  // 저장된 이름이 목록에 없으면 고급에서 넣은 것이다 — 목록에 그 이름 하나를 더해 둔다
  const saved = settings?.model
  const custom = saved && !isListedModel(engine, saved) ? saved : null
  const locked = !settings || busy

  // 엔진도 모델도 고르는 즉시 저장한다 — 저장 단추가 따로 있으면 고르고 떠난 사람의 선택이 말없이 사라진다.
  // 고른 값은 먼저 화면에 보이고(다시 읽기를 기다리는 사이 옛 엔진으로 고르지 않게), 저장이 도는 동안은 잠근다.
  // 실패하면 저장된 값으로 되돌린다 — 화면과 settings.json 이 어긋난 채 남지 않게
  const persist = (saving: Promise<unknown>): void => {
    setBusy(true)
    setStatus(null)
    saving
      .then(() => {
        setStatus({ ok: true, text: getT().settings.saved })
        refresh()
      })
      .catch((err: unknown) => {
        setStatus({ ok: false, text: saveFailed(err) })
        load()
      })
      .finally(() => setBusy(false))
  }

  return (
    <SettingsSection id="ai-settings" title={t.settings.ai.title}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t.settings.ai.pick}>
        {ENGINE_KINDS.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={engine === kind ? 'default' : 'outline'}
            aria-pressed={engine === kind}
            data-testid={`engine-kind:${kind}`}
            disabled={locked}
            onClick={() => {
              if (kind === engine) return
              setEngine(kind)
              setModel('')
              persist(switchEngine(kind))
            }}
          >
            {ENGINE_NAME[kind]}
          </Button>
        ))}
      </div>
      <p className="text-caption text-muted-foreground mt-2">
        {t.settings.ai.help[engine]} {t.settings.ai.saveNote}
      </p>
      <div className="mt-4 flex items-center gap-3">
        {/* Codex 쪽은 고를 칸이 없어 라벨을 걸 대상이 없다 */}
        {engine === 'claude' ? (
          <label htmlFor={modelId} className="text-callout w-16 shrink-0">
            {t.settings.ai.model}
          </label>
        ) : (
          <span className="text-callout w-16 shrink-0">{t.settings.ai.model}</span>
        )}
        {engine === 'claude' ? (
          <select
            id={modelId}
            data-testid="engine-model"
            disabled={locked}
            value={model}
            onChange={(e) => {
              const next = e.target.value
              setModel(next)
              persist(
                window.api
                  .setEngineSettings({
                    engine,
                    model: next || undefined,
                    draftModel: settings?.draftModel
                  })
                  .then(announceEngineSettings)
              )
            }}
            className="focus-ring text-callout min-w-0 flex-1 rounded border border-hairline bg-background px-2 py-1"
          >
            <option value="">{t.settings.ai.defaultModel}</option>
            {CLAUDE_MODEL_ALIASES.map((alias) => (
              <option key={alias} value={alias}>
                {alias}
              </option>
            ))}
            {custom && <option value={custom}>{t.settings.ai.customModel(custom)}</option>}
          </select>
        ) : (
          <p className="text-callout text-muted-foreground" data-testid="engine-model-note">
            {custom ? t.settings.ai.customModel(custom) : t.settings.ai.codexDefault}
          </p>
        )}
      </div>
      <p className="text-caption text-muted-foreground mt-2">{t.settings.ai.modelNote}</p>
      {status && (
        <p
          data-testid="engine-save-status"
          role={status.ok ? 'status' : 'alert'}
          className={`text-caption mt-2 ${status.ok ? 'text-muted-foreground' : 'text-destructive'}`}
        >
          {status.text}
        </p>
      )}
    </SettingsSection>
  )
}

export default EngineSection
