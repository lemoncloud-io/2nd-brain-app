// 좁은 창으로 열면 채팅 칸은 접힌 채로 — 떠 있는 채팅이 문서를 덮는다.
// 초기 1회만 닫고 이후 열기는 존중한다(리사이즈 추적이 아니다).
// 멱등한 set이라 StrictMode 이중 마운트에도 안전하다(toggle이 아니다).
import { useEffect } from 'react'
import { chatFloats } from '../../components/layout/shell-fit'
import { useWorkbench } from '../../store/workbench'

export const useChatNarrowInit = (): void => {
  useEffect(() => {
    if (chatFloats(window.innerWidth)) useWorkbench.setState({ chatOpen: false })
  }, [])
}
