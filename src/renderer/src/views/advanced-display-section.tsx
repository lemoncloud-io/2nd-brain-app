import { useState } from 'react'
import type { UiPrefs } from '../../../shared/ui-prefs'
import { SettingsSection } from '../components/layout/settings-section'
import { Checkbox } from '../components/ui/checkbox'
import { useWorkbench } from '../store/workbench'
import { toUserError } from '../lib/user-error'
import { getT, useT } from '../lib/i18n'

// 설정 → 고급 표시 — 평소에는 숨겨 두는 표기 둘. 기본은 꺼짐이다(DESIGN.md § AI 한계).
// 켜고 끈 결과는 트리·채팅이 바로 보여 주므로 여기서 미리 그려 주지 않는다.
// 화면 낱말은 `형식` 이다 — 확장자는 저장 구조의 말이다(DESIGN.md § 화면 말).
const TOGGLES: (keyof UiPrefs)[] = ['showFileExtensions', 'showChatMeters']

const AdvancedDisplaySection = (): React.JSX.Element => {
  const t = useT()
  const prefs = useWorkbench((s) => s.uiPrefs)
  const saveUiPrefs = useWorkbench((s) => s.saveUiPrefs)
  const [error, setError] = useState<string | null>(null)
  // 저장이 도는 동안 손잡이를 잠근다 — 저장 하나만 떠 있으면 늦게 온 응답이 새 선택을 덮을 일이 없다
  const [saving, setSaving] = useState(false)

  const toggle = (key: keyof UiPrefs, on: boolean): void => {
    setError(null)
    setSaving(true)
    // 렌더 때 닫아 둔 값이 아니라 지금 store 의 값에서 출발한다 — 앞선 저장이 아직 안 돌아왔어도
    // 그 결과를 되돌리지 않는다
    void saveUiPrefs({ ...useWorkbench.getState().uiPrefs, [key]: on })
      .catch((err: unknown) => {
        // store 는 저장된 값만 담는다 — 실패하면 손잡이가 저절로 제자리다
        setError(toUserError(err, getT().common.saveSettingFailed).text)
      })
      .finally(() => setSaving(false))
  }

  return (
    <SettingsSection title={t.settings.display.title}>
      <div className="flex flex-col gap-3">
        {TOGGLES.map((key) => (
          <label key={key} className="flex cursor-pointer items-start gap-2">
            <Checkbox
              className="mt-0.5"
              checked={prefs[key]}
              disabled={saving}
              data-testid={`ui-pref:${key}`}
              onCheckedChange={(next) => toggle(key, next === true)}
            />
            <span className="min-w-0">
              <span className="block text-callout text-foreground">
                {t.settings.display[key].label}
              </span>
              <span className="block text-caption text-muted-foreground">
                {t.settings.display[key].hint}
              </span>
            </span>
          </label>
        ))}
      </div>
      {error !== null && (
        <p role="alert" className="text-caption text-destructive mt-2">
          {error}
        </p>
      )}
    </SettingsSection>
  )
}

export default AdvancedDisplaySection
