import { setupComplete } from '../lib/start-steps'
import { useWorkbench } from '../store/workbench'
import { useSetup } from './use-setup'
import { useT } from '../lib/i18n'

export type NextStep = { label: string; onClick: () => void; testId: string }

/**
 * 빈 화면의 다음 행동 — 연결·보관함이 아직이면 시작하기로, 그 뒤로는 자료를 넣거나 위키화를 시작한다.
 * 준비는 그 둘뿐이라(lib/start-steps.ts) 위키화를 한 번도 안 한 사람도 여기서는 "자료 넣기" 로 간다.
 * 위키·그래프·승인·위키화 패널의 빈 상태가 같이 쓴다.
 */
export const useNextStep = (): NextStep => {
  const t = useT()
  const setup = useSetup()
  const setView = useWorkbench((s) => s.setView)
  const openKnowledge = useWorkbench((s) => s.openKnowledge)
  const requestIngest = useWorkbench((s) => s.requestIngest)
  if (!setupComplete(setup)) {
    return { label: t.shell.nextStart, onClick: () => setView('start'), testId: 'next-step:start' }
  }
  if ((setup.journey?.clippings ?? 0) > 0) {
    return { label: t.shell.nextIngest, onClick: requestIngest, testId: 'next-step:ingest' }
  }
  return {
    label: t.shell.nextAdd,
    onClick: () => openKnowledge('sources'),
    testId: 'next-step:sources'
  }
}
