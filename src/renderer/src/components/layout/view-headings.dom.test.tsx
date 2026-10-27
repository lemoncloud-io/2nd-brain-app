// @vitest-environment jsdom
// 뷰 머리글과 설정 묶음의 제목 위계 — h1 다음은 h2, h1은 text-title(DESIGN.md § 토큰).
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ViewHeader } from './view'
import { SettingsSection } from './settings-section'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

const mount = (node: React.ReactNode): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(node))
  return container
}

describe('뷰 제목 위계', () => {
  it('h1은 text-title(18px)이다 — 섹션 제목(15px)과 평평하지 않다', () => {
    const container = mount(<ViewHeader title="설정" description="설명" />)
    const h1 = container.querySelector('h1')!
    expect(h1.textContent).toBe('설정')
    expect(h1.className).toContain('text-title')
  })

  it('설정 묶음 제목은 h2다 — h1 다음 h3 건너뜀이 없다', () => {
    const container = mount(
      <>
        <ViewHeader title="설정" />
        <SettingsSection title="AI 연결">
          <p>본문</p>
        </SettingsSection>
      </>
    )
    const levels = [...container.querySelectorAll('h1, h2, h3, h4')].map((el) => el.tagName)
    expect(levels).toEqual(['H1', 'H2'])
  })

  it('heading={false}면 제목은 같은 모양의 글로 남고 h1은 없다 — 본문 h1과 겹치지 않는다', () => {
    const container = mount(<ViewHeader title="문서" heading={false} />)
    expect(container.querySelector('h1')).toBeNull()
    const title = container.querySelector('[data-testid="view-title"]')!
    expect(title.textContent).toBe('문서')
    expect(title.className).toContain('text-title')
  })
})
