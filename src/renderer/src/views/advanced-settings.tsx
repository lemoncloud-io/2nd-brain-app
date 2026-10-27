import { ChevronRight } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { isListedModel } from '../../../shared/engine-settings'
import { SettingsSection } from '../components/layout/settings-section'
import { useSetup } from '../hooks/use-setup'
import { cn } from '../lib/utils'
import AdvancedDisplaySection from './advanced-display-section'
import ClaudeUserSettingsSection from './claude-user-settings-section'
import DraftModelField from './draft-model-field'
import McpSection from './mcp-section'
import ModelCustomField from './model-custom-field'
import PanelReset from './panel-reset'
import DiagnosticsSection from './diagnostics-section'
import { useT } from '../lib/i18n'

// AI 프로그램이 어디 깔려 있는지 — 연결이 이상할 때 개발자가 확인하는 한 줄
const CliPath = (): React.JSX.Element => {
  const t = useT()
  const { engineStatus } = useSetup()
  const cli = engineStatus?.cli
  const text = !cli
    ? t.settings.advanced.cliChecking
    : 'path' in cli
      ? cli.path
      : t.settings.advanced.cliMissing
  return (
    <div data-testid="settings-cli-path">
      <p className="text-callout text-foreground">{t.settings.advanced.cliPath}</p>
      <p className="mt-1 break-all font-mono text-caption text-muted-foreground">{text}</p>
    </div>
  )
}

// 설정 맨 아래 '고급' — 모델 직접 입력·위키 초안 모델·MCP 서버·내 Claude 설정·고급 표시·AI 프로그램 위치·화면 배치 되돌리기·진단 정보.
// 처음 쓰는 사람의 설정 화면을 가볍게 두려고 접어 둔다. 켜 둔 MCP 서버나 목록에 없는 모델이 있으면 쓰는 중이라는
// 뜻이라 펼친 채로 연다 — 쓰고 있는 값이 접힌 칸 뒤에 숨지 않게.
const AdvancedSettings = (): React.JSX.Element => {
  const t = useT()
  const [open, setOpen] = useState(false)
  // 사람이 먼저 접거나 편 뒤에는 늦게 온 목록이 그 선택을 뒤집지 않는다
  const touched = useRef(false)
  const bodyId = useId()
  const hintId = useId()

  useEffect(() => {
    let alive = true
    const openIf = (inUse: boolean): void => {
      if (alive && !touched.current && inUse) setOpen(true)
    }
    // 못 읽었으면 접힌 채로 둔다 — 펼치면 그 칸이 같은 오류를 보여 준다
    window.api
      .getMcpServers()
      .then((servers) => openIf(servers.some((s) => s.enabled)))
      .catch(() => undefined)
    window.api
      .getEngineSettings()
      .then(({ engine, model, draftModel }) =>
        openIf((!!model && !isListedModel(engine, model)) || !!draftModel)
      )
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="border-b border-hairline py-6 last:border-b-0">
      {/* 헤딩 안의 버튼 — 헤딩으로 훑는 보조기기가 '고급' 칸을 찾는다(아코디언 패턴). 안쪽 칸도 같은 h3 라 목차는 평평하다 */}
      <h3 className="text-heading">
        <button
          type="button"
          className="focus-ring flex min-h-6 items-center gap-1.5 rounded text-left"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-describedby={open ? undefined : hintId}
          data-testid="settings-advanced-toggle"
          onClick={() => {
            touched.current = true
            setOpen((v) => !v)
          }}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90'
            )}
          />
          {t.settings.advanced.title}
        </button>
      </h3>
      <p id={hintId} hidden={open} className="mt-1 text-caption text-muted-foreground">
        {t.settings.advanced.hint}
      </p>
      {/* 접어도 지우지 않고 숨긴다 — 쓰다 만 MCP 서버 입력이 접는 순간 사라지지 않게 */}
      <div id={bodyId} hidden={!open} className="mt-2 pl-5">
        <ModelCustomField />
        <DraftModelField />
        <McpSection />
        <ClaudeUserSettingsSection />
        <AdvancedDisplaySection />
        <SettingsSection title={t.settings.advanced.troubleshoot}>
          <div className="flex flex-col gap-4">
            <CliPath />
            <PanelReset />
            <DiagnosticsSection />
          </div>
        </SettingsSection>
      </div>
    </section>
  )
}

export default AdvancedSettings
