// 웹 페이지 덮개 감지 — 웹 view 는 앱 화면 위에 네이티브로 떠서 팔레트·확인 창·메뉴가 그 밑에 깔린다.
// 그런 창이 떠 있는지 본다. 팔레트(Radix Dialog)·확인 창(AlertDialog)·메뉴(DropdownMenu·ContextMenu)는 body 에
// 포털로 붙고 role 을 단다. 채팅 입력의 목록(listbox)은 오른쪽 칸 안에서만 펴져 문서 자리를 덮지 않으므로 뺀다.
// 다른 덮는 창은 `data-web-overlay` 를 단다.
import { useSyncExternalStore } from 'react'

export const OVERLAY_SELECTOR =
  '[role="dialog"],[role="alertdialog"],[role="menu"],[data-web-overlay]'

let seq = 0
let current = 0

/** 덮개가 떠 있는 동안의 번호 — 없으면 0, 새로 뜰 때마다 새 번호(그 번호로 찍은 모습만 깐다) */
const read = (): number => {
  const covered = document.querySelector(OVERLAY_SELECTOR) !== null
  if (!covered) current = 0
  else if (current === 0) current = ++seq
  return current
}

const subscribe = (notify: () => void): (() => void) => {
  const observer = new MutationObserver(notify)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['role', 'data-web-overlay']
  })
  return () => {
    observer.disconnect()
    // 안 보는 동안 덮개가 닫혀도 모른다 — 다시 볼 때 옛 번호(옛 모습)를 쓰지 않게 비운다
    current = 0
  }
}

const idle = (): (() => void) => () => {}
const none = (): number => 0

/** 웹 view 가 떠 있을 때만 본다(`active`) — 안 보일 때까지 문서 변화마다 셀 이유가 없다 */
export const useWebOverlay = (active: boolean): number =>
  useSyncExternalStore(active ? subscribe : idle, active ? read : none)
