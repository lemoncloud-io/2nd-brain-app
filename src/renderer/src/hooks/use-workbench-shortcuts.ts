// 전역 단축키 — 무엇이 어떤 키인지는 lib/commands.ts 한 곳이 정한다. 여기는 키를 명령으로 바꾸고
// 양보 조건(글 고치는 중·이동 확인·팔레트)을 재는 일만 한다. Escape 는 명령이 아니라 "열린 근거 닫기" 라 직접.
import { useEffect } from 'react'
import { allowedWhilePaletteOpen, commandForKey, type KeyGuard } from '../lib/commands'
import { useWorkbench } from '../store/workbench'

const isMac = navigator.userAgent.includes('Mac')

const guardOf = (target: EventTarget | null): KeyGuard => {
  const el = target instanceof HTMLElement ? target : null
  return {
    // 글을 고치는 중(위키 편집기·contentEditable)에는 양보한다 — 문장 쓰다 끌려가면 자리를 잃는다.
    // 일반 입력칸은 막지 않는다 — 검색 입력칸에서 ⌘J 로 채팅에 오는 길이다
    editing: el !== null && (el.isContentEditable || el.closest('.cm-editor') !== null),
    // 여러 줄 입력칸(채팅)은 옆 칸에 계속 떠 있어서, 질문을 쓰는 중에 뒤로·앞으로가 뒤의 결과물을 넘기면 자리를 잃는다
    textarea: el instanceof HTMLTextAreaElement
  }
}

/**
 * Mod(+Alt)+code 를 명령으로 돌린다 — 돌렸으면 true. 키보드 이벤트와 웹 view 초점에서 main 이 넘긴 키(use-web-events)가
 * 같은 길로 온다
 */
export const runCommandKey = (code: string, alt: boolean, guard: KeyGuard): boolean => {
  const command = commandForKey(code, alt)
  if (command === undefined) return false
  const state = useWorkbench.getState()
  // 이동 확인이 떠 있으면 그 답이 먼저다. 팔레트가 떠 있으면 그 뒤에서 화면을 바꾸지 않는다(⌘K·⌘P 로 닫는 것만)
  if (state.pendingNavigation) return false
  if (state.paletteOpen && !allowedWhilePaletteOpen(command.id)) return false
  if (command.when !== undefined && !command.when(state, guard)) return false
  command.run(state)
  return true
}

export const useWorkbenchShortcuts = (): void => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // Escape 는 열린 근거를 닫는다 — 채팅 칸은 초점을 가져가지 않으므로(글 쓰는 중에 뺏지 않는다)
      // 그 칸의 키 처리로는 닿지 않는다. 조합키 없이 오므로 아래 Mod 판정보다 앞이다
      if (e.key === 'Escape' && !e.defaultPrevented && !e.isComposing) {
        const open = useWorkbench.getState()
        if (open.peek !== null && !open.paletteOpen && open.pendingNavigation === null) {
          open.closePeek()
        }
        return
      }
      const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
      // 조합 중(한글 IME)인 키는 글자 입력의 일부다 — 가로채지 않는다
      if (!mod || e.shiftKey || e.defaultPrevented || e.isComposing) return
      // 한글 자판에서도 같은 자리 키로 동작하게 e.code 를 본다
      if (runCommandKey(e.code, e.altKey, guardOf(e.target))) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
