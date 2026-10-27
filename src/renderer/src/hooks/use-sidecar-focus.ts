// 옆 칸 초점 — 밖(가운데·자료 화면)에서 옆 칸 탭을 열면 제목으로 초점이 따라간다.
// 칸 안에서 탭을 옮기면 조용하다: 초점이 이미 칸 안에 있으면 뺏지 않는다.
// 글을 쓰는 중(textarea·input·편집 중)에도 뺏지 않는다 — peek-pane 의 같은 규칙.
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useWorkbench, type ChatTab } from '../store/workbench'

export const useSidecarFocus = (tab: ChatTab, titleRef: RefObject<HTMLElement | null>): void => {
  const chatTab = useWorkbench((s) => s.chatTab)
  const at = useWorkbench((s) => s.sidecarFocusAt)
  const seen = useRef(at)
  useLayoutEffect(() => {
    if (seen.current === at) return
    seen.current = at
    if (chatTab !== tab) return
    const active = document.activeElement
    // 칸 안에서 옮긴 탭이다 — 탭 줄·단추의 초점을 살린다
    if (active instanceof HTMLElement && active.closest('[data-testid="chat-pane"]') !== null)
      return
    const typing =
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLInputElement ||
      (active instanceof HTMLElement && active.isContentEditable)
    if (!typing) titleRef.current?.focus({ preventScroll: true })
  }, [at, chatTab, tab, titleRef])
}
