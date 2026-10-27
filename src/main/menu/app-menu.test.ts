import { describe, expect, it } from 'vitest'
import { buildMenuTemplate } from './app-menu'

/** 메뉴바 가속키 전수 — ⌘W가 메뉴에 묶이면 탭 대신 창이 닫힌다 */
const accelerators = (platform: NodeJS.Platform): string[] => {
  const found: string[] = []
  const walk = (items: { accelerator?: string; submenu?: unknown[] }[]): void => {
    for (const item of items) {
      if (item.accelerator) found.push(item.accelerator)
      if (Array.isArray(item.submenu)) walk(item.submenu as { accelerator?: string }[])
    }
  }
  walk(buildMenuTemplate(platform) as { accelerator?: string; submenu?: unknown[] }[])
  return found
}

describe('buildMenuTemplate', () => {
  it('macOS 메뉴에 ⌘W가 없다 — 탭 닫기는 before-input-event가 받는다', () => {
    const keys = accelerators('darwin')
    expect(keys.some((a) => a.replace(/\s/g, '').includes('CmdOrCtrl+W'))).toBe(false)
  })

  it('macOS 기본 동작은 남긴다 — 종료·편집·최소화·줌', () => {
    const template = JSON.stringify(buildMenuTemplate('darwin'))
    for (const role of ['quit', 'undo', 'cut', 'copy', 'paste', 'minimize', 'zoom']) {
      expect(template).toContain(role)
    }
  })

  it('macOS가 아니면 메뉴를 두지 않는다 — 지금과 같이 메뉴바 없음 유지', () => {
    expect(buildMenuTemplate('win32')).toEqual([])
    expect(buildMenuTemplate('linux')).toEqual([])
  })
})
