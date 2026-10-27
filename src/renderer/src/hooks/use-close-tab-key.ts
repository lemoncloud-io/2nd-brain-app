// main 이 가로챈 ⌘W(Ctrl+W) — 창 대신 켜진 탭을 닫는다. Alt+⌘W 명령과 같은 closeTab 한 곳으로 간다.
import { useEffect } from 'react'
import { useWorkbench } from '../store/workbench'

export const useCloseTabKey = (): void => {
  useEffect(
    () =>
      window.api.onCloseCurrentTab(() => {
        const { tabs, tabAt, closeTab } = useWorkbench.getState()
        const tab = tabs[tabAt]
        if (tab) closeTab(tab.id)
      }),
    []
  )
}
