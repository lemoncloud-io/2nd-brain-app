// 뷰는 숨긴 채 마운트돼 있다 — 안쪽이 자기 뷰 id 를 알아 보일 때만 그리거나 묻는다.
import { createContext, useContext } from 'react'
import { useWorkbench, type ViewId } from '../../store/workbench'

export const ViewContext = createContext<ViewId | null>(null)

/** 이 뷰가 지금 보이는가 — 숨긴 채 마운트된 뷰가 폴링·타이머를 멈출 때 쓴다. 뷰 밖(패널)은 늘 참 */
export const useViewVisible = (): boolean => {
  const id = useContext(ViewContext)
  return useWorkbench((s) => id === null || s.view === id)
}
