import { ListChecks } from 'lucide-react'
import { ViewHeader, ViewBody } from '../components/layout/view'
import { SettingsSection } from '../components/layout/settings-section'
import { GITHUB_SECTION } from '../lib/reveal-settings'
import { EngineConnect } from '../components/start/engine-connect'
import { TeamRepo } from '../components/start/team-repo'
import { Button } from '../components/ui/button'
import { useWorkbench } from '../store/workbench'
import VaultSection from '../pages/VaultSection'
import AppearanceSection from './appearance-section'
import EngineSection from './engine-section'
import ChatDefaultsSection from './chat-defaults-section'
import UpdateSection from './update-section'
import AdvancedSettings from './advanced-settings'
import { useT } from '../lib/i18n'

// 설정 — AI 연결·볼트·팀 저장소·엔진 모델·화면을 한 화면에. 처음 준비 순서는 시작하기가 이끈다.
// 시작하기는 첫 병합 뒤 사이드바에서 빠지므로, 다시 여는 길은 여기 하나다.
const SettingsView = (): React.JSX.Element => {
  const t = useT()
  const reopenStart = useWorkbench((s) => s.reopenStart)
  return (
    <>
      <ViewHeader title={t.settings.title} description={t.settings.description}>
        <Button variant="outline" size="sm" data-testid="reopen-start" onClick={reopenStart}>
          <ListChecks aria-hidden /> {t.settings.reopenStart}
        </Button>
      </ViewHeader>
      <ViewBody width="reading">
        <div>
          {/* AI 는 연결과 설정이 같은 주제다 — 두 섹션으로 갈라 두면 엔진을 바꾸려고 화면을 왕복한다 */}
          <SettingsSection title={t.settings.aiConnect}>
            <p className="mb-2 text-caption text-muted-foreground">
              {t.settings.aiConnectLead}{' '}
              <a href="#ai-settings" className="text-primary-ink underline underline-offset-2">
                {t.settings.aiConnectLink}
              </a>
              {t.settings.aiConnectTail}
            </p>
            <EngineConnect compact />
          </SettingsSection>
          <EngineSection />
          {/* 묻는 모양은 여기서 정한다 — 입력칸 칩이 아니라 다음 질문부터 따라가는 기본값이다 */}
          <ChatDefaultsSection />
          <VaultSection />
          <SettingsSection id={GITHUB_SECTION} title={t.settings.teamRepo}>
            <TeamRepo />
          </SettingsSection>
          <AppearanceSection />
          <UpdateSection />
          {/* 개발자용 손잡이는 맨 아래 한 칸에 접어 둔다 — 처음 쓰는 사람의 설정 화면을 가볍게 */}
          <AdvancedSettings />
        </div>
      </ViewBody>
    </>
  )
}

export default SettingsView
