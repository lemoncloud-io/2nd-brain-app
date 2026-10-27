// @vitest-environment jsdom
// 덮개 감지 — 팔레트·확인 창·메뉴가 뜨면 번호가 생기고, 닫히면 0. 채팅 입력 목록(listbox)은 덮개가 아니다.
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWebOverlay } from './use-web-overlay'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
let seen: number[] = []

const Host = ({ active }: { active: boolean }): null => {
  seen.push(useWebOverlay(active))
  return null
}

const mount = (active: boolean): Root => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<Host active={active} />))
  return root
}

/** body 에 포털처럼 붙인다 — MutationObserver 콜백은 마이크로태스크라 act 안에서 기다린다 */
const attach = async (attrs: Record<string, string>): Promise<HTMLElement> => {
  const el = document.createElement('div')
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
  await act(async () => {
    document.body.appendChild(el)
  })
  return el
}

const last = (): number => seen[seen.length - 1]

describe('useWebOverlay', () => {
  it('dialog·alertdialog·menu·data-web-overlay 가 뜨면 번호, 닫히면 0', async () => {
    mount(true)
    expect(last()).toBe(0)
    const kinds: Record<string, string>[] = [
      { role: 'dialog' },
      { role: 'alertdialog' },
      { role: 'menu' },
      { 'data-web-overlay': '' }
    ]
    for (const attrs of kinds) {
      const el = await attach(attrs)
      expect(last()).not.toBe(0)
      await act(async () => el.remove())
      expect(last()).toBe(0)
    }
  })

  it('다시 뜨면 새 번호다 — 앞에 찍은 모습을 다시 깔지 않는다', async () => {
    mount(true)
    const first = await attach({ role: 'dialog' })
    const one = last()
    await act(async () => first.remove())
    await attach({ role: 'dialog' })
    expect(last()).not.toBe(one)
    expect(last()).not.toBe(0)
  })

  it('채팅 입력 목록(listbox)은 덮개가 아니다', async () => {
    mount(true)
    await attach({ role: 'listbox' })
    expect(last()).toBe(0)
  })

  it('웹 view 가 안 떠 있으면(active=false) 보지 않는다', async () => {
    mount(false)
    await attach({ role: 'dialog' })
    expect(last()).toBe(0)
  })
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  seen = []
})
