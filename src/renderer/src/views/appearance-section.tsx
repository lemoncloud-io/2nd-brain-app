import { useMemo, useState } from 'react'
import { SettingsSection } from '../components/layout/settings-section'
import { Button } from '../components/ui/button'
import { ErrorNote } from '../components/error-note'
import { toUserError } from '../lib/user-error'
import { useT } from '../lib/i18n'
import type { ThemeSetting } from '../../../shared/theme'
import { LanguagePicker } from '../components/language-picker'

const applyTheme = (theme: ThemeSetting): void => {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

const currentTheme = (): ThemeSetting =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'

// 알림·오류는 문장이 아니라 무슨 일이었는지를 둔다 — 문장은 그릴 때 만든다.
// 언어를 바꾸는 클릭이 실패해도 그 오류는 바꾼 언어로 보이고, 나중에 언어를 바꾸면 떠 있는 것도 따라간다
type Note = 'obsidian' | 'folder'
type Failure = { during: 'save' | 'obsidian'; cause: unknown }

const AppearanceSection = (): React.JSX.Element => {
  const t = useT()
  const [theme, setTheme] = useState<ThemeSetting>(currentTheme)
  const [note, setNote] = useState<Note | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const error = useMemo(
    () =>
      failure &&
      toUserError(
        failure.cause,
        failure.during === 'save' ? t.common.saveSettingFailed : t.appearance.openInObsidianFailed
      ),
    [failure, t]
  )

  const openObsidian = (): void => {
    setNote(null)
    setFailure(null)
    window.api
      .openInObsidian()
      .then((result) => {
        if ('error' in result) {
          setFailure({ during: 'obsidian', cause: result.error })
          return
        }
        // 폴더로 열렸다는 것은 Obsidian 이 없다는 뜻이다 — 아무 말 없이 폴더를 띄우면 오작동으로 보인다
        setNote(result.via)
      })
      .catch((cause: unknown) => setFailure({ during: 'obsidian', cause }))
  }

  // 화면은 이미 바뀌었다 — 기억에 못 남겼다는 것만 알린다. 다시 눌러 저장되면 그 알림을 걷는다
  const saved = (): void => setFailure((f) => (f?.during === 'save' ? null : f))
  const saveFailed = (cause: unknown): void => setFailure({ during: 'save', cause })

  return (
    <SettingsSection title={t.appearance.title}>
      <div role="group" aria-label={t.appearance.theme} className="flex flex-wrap gap-2">
        {(['light', 'dark'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={theme === value ? 'default' : 'outline'}
            aria-pressed={theme === value}
            data-testid={`theme-${value}`}
            onClick={() => {
              setTheme(value)
              applyTheme(value)
              window.api.setTheme(value).then(saved, saveFailed)
            }}
          >
            {value === 'light' ? t.appearance.light : t.appearance.dark}
          </Button>
        ))}
      </div>
      <LanguagePicker onSaved={saved} onSaveFailed={saveFailed} className="mt-3" />
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" data-testid="open-obsidian" onClick={openObsidian}>
          {t.appearance.openInObsidian}
        </Button>
      </div>
      {note && (
        <p className="mt-2 text-caption text-muted-foreground" data-testid="appearance-note">
          {note === 'obsidian' ? t.appearance.openedInObsidian : t.appearance.openedAsFolder}
        </p>
      )}
      {error && <ErrorNote error={error} testId="appearance-error" className="mt-2" />}
    </SettingsSection>
  )
}

export default AppearanceSection
