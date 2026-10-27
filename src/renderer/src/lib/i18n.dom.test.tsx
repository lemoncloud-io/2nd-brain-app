// @vitest-environment jsdom
// 언어를 바꾸면 이미 그려진 화면이 다시 그려진다 — 컴포넌트는 구독하고, 컴포넌트 밖 헬퍼는 부르는 시점에 읽는다.
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { applyLanguage, getT, useT } from './i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  applyLanguage('ko')
})

const Title = (): React.JSX.Element => <h1>{useT().appearance.title}</h1>

describe('renderer i18n', () => {
  it('언어를 바꾸면 이미 그려진 문구가 다시 그려지고 <html lang> 이 따라간다', () => {
    const host = document.body.appendChild(document.createElement('div'))
    const root = createRoot(host)
    roots.push(root)
    act(() => root.render(<Title />))
    expect(host.textContent).toBe('화면')
    act(() => applyLanguage('en'))
    expect(host.textContent).toBe('Appearance')
    expect(document.documentElement.lang).toBe('en')
  })

  it('컴포넌트 밖 헬퍼는 부르는 시점의 언어를 읽는다', () => {
    expect(getT().appearance.title).toBe('화면')
    applyLanguage('en')
    expect(getT().appearance.title).toBe('Appearance')
  })
})
