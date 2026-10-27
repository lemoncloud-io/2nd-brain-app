// 설정 → 채팅 기본값 — 질문마다 따라가는 권한 모드. 바꾸면 다음 질문부터 바뀐다.
// 손잡이 문구는 비개발자 기준 — 토큰 수·모드 영문명을 내지 않는다.
import { useEffect, useState } from 'react'
import { SettingsSection } from '../components/layout/settings-section'
import { Button } from '../components/ui/button'
import { toUserError } from '../lib/user-error'
import {
  DEFAULT_CHAT_DEFAULTS,
  normalizeChatDefaults,
  type ChatDefaults
} from '../../../shared/chat-defaults'
import { CHAT_PERMISSION_MODES } from '../../../shared/chat-permission'
import { getT, useT } from '../lib/i18n'

const ChatDefaultsSection = (): React.JSX.Element => {
  const t = useT()
  const [current, setCurrent] = useState<ChatDefaults | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 저장이 도는 동안 손잡이를 잠근다 — 늦게 온 응답이 새 선택을 덮지 않게
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api
      .getChatDefaults()
      .then((saved) => setCurrent(normalizeChatDefaults(saved)))
      .catch((err: unknown) => {
        // 못 읽었다고 손잡이를 잠그지 않는다 — 잠기면 다시 시도할 길이 없다
        setCurrent({ ...DEFAULT_CHAT_DEFAULTS })
        setError(toUserError(err, getT().settings.chat.readFailed).text)
      })
  }, [])

  const choose = (next: ChatDefaults): void => {
    setError(null)
    // 화면을 먼저 옮기고 저장이 실패하면 되돌린다 — 누른 값이 안 붙으면 손잡이가 고장 난 것처럼 보인다
    const previous = current
    setCurrent(next)
    setSaving(true)
    window.api
      // 이 칸의 값만 보낸다 — 고급의 '내 Claude 설정' 손잡이 값을 덮지 않게
      .setChatDefaults({ permissionMode: next.permissionMode })
      .then((saved) => setCurrent(normalizeChatDefaults(saved)))
      .catch((err: unknown) => {
        setCurrent(previous)
        setError(toUserError(err, getT().settings.chat.saveFailed).text)
      })
      .finally(() => setSaving(false))
  }

  const locked = current === null || saving
  const modeHint = current === null ? undefined : t.tools.mode[current.permissionMode].hint

  return (
    <SettingsSection title={t.settings.chat.title}>
      <div
        role="radiogroup"
        aria-label={t.settings.chat.modeGroup}
        className="flex flex-wrap gap-2"
        data-testid="chat-default-mode"
      >
        {CHAT_PERMISSION_MODES.map((mode) => (
          <Button
            key={mode}
            size="sm"
            variant={current?.permissionMode === mode ? 'default' : 'outline'}
            role="radio"
            aria-checked={current?.permissionMode === mode}
            data-testid={`chat-default-mode-${mode}`}
            title={t.tools.mode[mode].hint}
            disabled={locked}
            onClick={() => current && choose({ ...current, permissionMode: mode })}
          >
            {t.tools.mode[mode].label}
          </Button>
        ))}
      </div>
      <p className="text-caption text-muted-foreground mt-2" data-testid="chat-default-mode-hint">
        {current === null ? t.shell.reading : modeHint}
      </p>
      {error !== null && (
        <p role="alert" className="text-caption text-destructive mt-2">
          {error}
        </p>
      )}
    </SettingsSection>
  )
}

export default ChatDefaultsSection
