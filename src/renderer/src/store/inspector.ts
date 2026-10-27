// 옆 칸 근거 닫기 정책 — 어느 슬라이스에도 속하지 않는다.
// 중앙이 움직이면(navigate·뒤로·보관함 전환) 같은 근거는 쓸모가 없어 접고, 근거를 열기 전 탭으로 돌아간다.
// 읽던 근거가 없었으면 사용자가 세워 둔 탭을 빼앗지 않고 그대로 둔다. 근거를 연 자리는 근거와 함께 버린다.
import type { ChatTab, Peek } from './sidecar'

export const closedInspector = (s: {
  peek: Peek | null
  peekFrom: ChatTab | null
  chatTab: ChatTab
}): { peek: null; peekFrom: null; chatTab: ChatTab } => ({
  peek: null,
  peekFrom: null,
  chatTab: s.peek !== null && s.chatTab === 'peek' ? (s.peekFrom ?? 'chat') : s.chatTab
})
