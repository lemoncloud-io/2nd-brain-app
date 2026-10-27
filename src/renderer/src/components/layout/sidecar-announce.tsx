// 옆 칸 알림 — 밖에서 옆 칸 탭을 열면 스크린리더에 한 줄 알린다.
// 칸 안 탭 이동은 조용하다: 신호(sidecarFocusAt)가 울릴 때만 말한다.
import { useEffect, useState } from 'react'
import { useWorkbench } from '../../store/workbench'
import { CHAT_TABS } from '../../views/chat/chat-tabs'
import { getT } from '../../lib/i18n'

export const SidecarAnnounce = (): React.JSX.Element => {
  const [message, setMessage] = useState('')
  // 바깥 저장소를 구독한다 — effect 안에서 setState 를 직접 부르지 않는다
  useEffect(
    () =>
      useWorkbench.subscribe((state, previous) => {
        if (state.sidecarFocusAt === previous.sidecarFocusAt) return
        // 칸 안에서 옮긴 탭이다 — 탭 줄 이동은 조용하다
        const active = document.activeElement
        if (active instanceof HTMLElement && active.closest('[data-testid="chat-pane"]') !== null)
          return
        const t = getT()
        const label = CHAT_TABS.find((c) => c.id === state.chatTab)?.label ?? t.shell.sidecar
        setMessage(t.shell.sidecarOpened(label))
      }),
    []
  )
  return (
    <p role="status" data-testid="sidecar-announce" className="sr-only">
      {message}
    </p>
  )
}
