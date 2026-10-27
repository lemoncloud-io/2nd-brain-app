// main 이 웹 탭에 대해 알리는 것 셋 — 상태(제목·주소·불러오는 중), 새 창 요청, 페이지 초점에서 눌린 앱 단축키.
import { useEffect } from 'react'
import { useWorkbench } from '../store/workbench'
import { WEB_ADDRESS_ID } from '../lib/web-text'
import { runCommandKey } from './use-workbench-shortcuts'

/** 페이지 초점에서 온 키는 편집기 밖이다 — 양보할 글이 없다 */
const IN_PAGE = { editing: false, textarea: false }

export const useWebEvents = (): void => {
  useEffect(() => {
    // 숨은 탭 것도 받아 탭 이름을 맞춘다
    const offState = window.api.onWebState((state) =>
      useWorkbench.getState().webStateChanged(state)
    )
    const offOpen = window.api.onWebOpenRequest((url) => useWorkbench.getState().openWeb(url))
    const offKey = window.api.onWebShortcut((key) => {
      const state = useWorkbench.getState()
      if (!key.alt && key.code === 'KeyW') {
        // ⌘W 는 명령 표 밖이다(main 이 창 렌더러에서도 따로 가로챈다) — 그 웹 탭을 닫는다
        if (!state.pendingNavigation) state.closeTab(key.tabId)
        return
      }
      if (!key.alt && key.code === 'KeyL') {
        const address = document.getElementById(WEB_ADDRESS_ID)
        if (address instanceof HTMLInputElement) {
          address.focus()
          address.select()
        }
        return
      }
      if (!key.alt && key.code === 'KeyR') {
        void window.api.webReload(key.tabId)
        return
      }
      runCommandKey(key.code, key.alt, IN_PAGE)
    })
    return () => {
      offState()
      offOpen()
      offKey()
    }
  }, [])
}
