import { useEffect, useState } from 'react'
import { SettingsSection } from '../components/layout/settings-section'
import { Checkbox } from '../components/ui/checkbox'
import { toUserError } from '../lib/user-error'
import { getT, useT } from '../lib/i18n'
import { DEFAULT_CHAT_DEFAULTS, normalizeChatDefaults } from '../../../shared/chat-defaults'

// 설정 → 고급 → 내 Claude 설정 — 이 컴퓨터에서 Claude를 직접 쓰는 사람만 뜻이 있는 손잡이라 고급에 둔다.
// 채팅 기본값(`chatDefaults.userSettings`)에 저장하되 이 값만 보낸다 — 채팅 칸의 권한 모드를 덮지 않게
const ClaudeUserSettingsSection = (): React.JSX.Element => {
  const t = useT()
  const [on, setOn] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api
      .getChatDefaults()
      .then((saved) => setOn(normalizeChatDefaults(saved).userSettings))
      .catch((err: unknown) => {
        setOn(DEFAULT_CHAT_DEFAULTS.userSettings)
        setError(toUserError(err, getT().settings.claudeUser.readFailed).text)
      })
  }, [])

  const toggle = (next: boolean): void => {
    setError(null)
    const previous = on
    setOn(next)
    setSaving(true)
    window.api
      .setChatDefaults({ userSettings: next })
      .then((saved) => setOn(normalizeChatDefaults(saved).userSettings))
      .catch((err: unknown) => {
        setOn(previous)
        setError(toUserError(err, getT().settings.claudeUser.saveFailed).text)
      })
      .finally(() => setSaving(false))
  }

  return (
    <SettingsSection title={t.settings.claudeUser.title}>
      <label className="flex cursor-pointer items-start gap-2">
        <Checkbox
          className="mt-0.5"
          checked={on ?? DEFAULT_CHAT_DEFAULTS.userSettings}
          disabled={on === null || saving}
          data-testid="chat-default-user-settings"
          onCheckedChange={(next) => toggle(next === true)}
        />
        <span className="min-w-0">
          <span className="block text-callout text-foreground">{t.settings.claudeUser.label}</span>
          <span className="block text-caption text-muted-foreground">
            {t.settings.claudeUser.hint}
          </span>
        </span>
      </label>
      {error !== null && (
        <p role="alert" className="text-caption text-destructive mt-2">
          {error}
        </p>
      )}
    </SettingsSection>
  )
}

export default ClaudeUserSettingsSection
