// macOS 앱 메뉴 — 기본 메뉴의 창 닫기(⌘W)가 탭 닫기를 가로채기 전에 뺀다.
// Edit(잘라내기·복사·붙여넣기)와 종료(⌘Q)는 기본 그대로 둔다 — 입력칸 단축키가 메뉴에 기대 산다.
// Windows·Linux는 메뉴바 없음(autoHideMenuBar)을 유지한다 — Ctrl+W는 before-input-event가 받는다.
import type { MenuItemConstructorOptions } from 'electron'

/** 닫기 항목 없음 — ⌘W는 탭 닫기로 쓴다 */
export const buildMenuTemplate = (platform: NodeJS.Platform): MenuItemConstructorOptions[] => {
  if (platform !== 'darwin') return []
  return [
    {
      label: '2nd Brain',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }]
    }
  ]
}
