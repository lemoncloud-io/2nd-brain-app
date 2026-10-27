// 옆 칸의 세입자 — 전부 마운트한 채 보이기만 바꾼다: 진행 중인 위키화의 구독과
// 대화 스크롤이 탭을 옮겨도 살아 있어야 한다.
import type { ChatTab } from '../../store/workbench'
import { getT } from '../../lib/i18n'

// 글자는 읽을 때 사전에서 — 탭 목록은 모듈에 한 번 만들고, 언어가 바뀌어도 다시 만들지 않는다
const tab = (id: ChatTab): { id: ChatTab; label: string; back: string } => ({
  id,
  get label() {
    return getT().chatView.tabs[id].label
  },
  /** 그 탭으로 돌아가는 단추 글자(참고한 페이지 머리의 "← 채팅으로") */
  get back() {
    return getT().chatView.tabs[id].back
  }
})

export const CHAT_TABS: { id: ChatTab; label: string; back: string }[] = [
  tab('chat'),
  tab('peek'),
  tab('ingest'),
  tab('history')
]

/**
 * 탭 띠에 보이는 탭 — 채팅·위키 초안은 늘, 참고한 페이지는 근거가 열려 있는 동안, 기록은 보고 있는 동안만.
 * 나머지 둘은 다른 화면이 채워 주기 전에는 빈 칸이라 늘 두지 않는다.
 * 활성 탭은 언제나 든다(띠에 고른 탭이 없는 상태를 만들지 않는다)
 */
export const visibleChatTabs = ({
  chatTab,
  hasPeek
}: {
  chatTab: ChatTab
  hasPeek: boolean
}): typeof CHAT_TABS =>
  CHAT_TABS.filter(
    (tab) =>
      tab.id === 'chat' ||
      tab.id === 'ingest' ||
      tab.id === chatTab ||
      (tab.id === 'peek' && hasPeek)
  )
