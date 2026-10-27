// 워크벤치 전역 상태 — 중앙 뷰·옆 칸(채팅)·위키 페이지 목록·근거·이동 기록.
// 도메인별 슬라이스(document·sidecar·vault-data·overlays)를 한 `create` 로 묶는다 —
// 호출부는 `useWorkbench((s) => …)` 그대로 쓴다. 타입은 `store/views.ts`·각 슬라이스에 있고
// 여기는 합치는 일과 예전 이름의 re-export 만 한다.
import { create } from 'zustand'
import { createDocumentSlice, type DocumentSlice } from './document'
import { createOverlaySlice, type OverlaySlice } from './overlays'
import { createSidecarSlice, type SidecarSlice } from './sidecar'
import { createVaultDataSlice, type VaultDataSlice } from './vault-data'
import { viewLabel, type ViewId } from './views'
import { onLanguageChange } from '../lib/i18n'

export { viewLabel }
export type { ViewId }
export type { KnowledgeSection } from './overlays'
export type { ChatTab, Peek, VersionPick } from './sidecar'
export type { SidebarPane } from './vault-data'
export { setReaderScrollTop } from './document'

export type WorkbenchState = DocumentSlice & SidecarSlice & VaultDataSlice & OverlaySlice

export const useWorkbench = create<WorkbenchState>()((...a) => ({
  ...createDocumentSlice(...a),
  ...createSidecarSlice(...a),
  ...createVaultDataSlice(...a),
  ...createOverlaySlice(...a)
}))

// 목록 오류는 main 이 보낸 문장이라 받은 때의 언어다 — 언어를 바꾸면 실패해 둔 목록만 다시 읽는다
onLanguageChange(() => {
  const s = useWorkbench.getState()
  if (s.treeError !== null) void s.refreshTree()
  if (s.docsError !== null) void s.refreshDocs()
  if (s.pagesError !== null) void s.refreshPages()
})
