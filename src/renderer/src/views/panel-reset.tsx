import { useState } from 'react'
import { Button } from '../components/ui/button'
import { ErrorNote } from '../components/error-note'
import { toUserError, type UserError } from '../lib/user-error'
import { getT, useT } from '../lib/i18n'

// 화면 배치 localStorage 키 — App.tsx·store/workbench.ts 와 같은 값
const PANEL_KEYS = [
  'second-brain.sidebar.width',
  'second-brain.sidebar.shown',
  'second-brain.chat.width',
  // 옛 셸·없어진 패널이 남긴 것 — 되돌리기가 같이 걷어 간다
  'second-brain.graph-insights.open',
  'second-brain.sidebar.rail',
  'second-brain.list.width',
  'second-brain.dock.width',
  'second-brain.panel.tab',
  '2nd-brain:left-collapsed'
]

// 화면 배치 되돌리기 — 칸 너비·접힘을 기본으로. 설정의 '고급' 안에 둔다
const PanelReset = (): React.JSX.Element => {
  const t = useT()
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<UserError | null>(null)

  return (
    <div>
      <Button
        size="sm"
        variant="outline"
        data-testid="panel-reset"
        onClick={() => {
          setNote(null)
          setError(null)
          try {
            for (const key of PANEL_KEYS) localStorage.removeItem(key)
            setNote(getT().settings.panelReset.done)
          } catch (e) {
            setError(toUserError(e, getT().settings.panelReset.failed))
          }
        }}
      >
        {t.settings.panelReset.action}
      </Button>
      {/* 알림 칸은 늘 두고 글만 바꾼다 — 글과 함께 생긴 칸은 보조기기가 읽지 않을 수 있다 */}
      <p
        role="status"
        className="mt-2 text-caption text-muted-foreground empty:hidden"
        data-testid="panel-reset-note"
      >
        {note}
      </p>
      {error && <ErrorNote error={error} testId="panel-reset-error" className="mt-2" />}
    </div>
  )
}

export default PanelReset
