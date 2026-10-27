// @vitest-environment jsdom
// 글 분량 줄 — 글을 고치지 않아도 화면 언어를 바꾸면 그 언어로 다시 센다
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditorCount } from './editor-count'
import { applyLanguage } from '../../lib/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  act(() => applyLanguage('ko'))
})

describe('EditorCount', () => {
  it('언어를 바꾸면 글이 그대로여도 새 언어로 보인다', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => root.render(<EditorCount text="hello" selected="" />))
    const line = (): string =>
      container.querySelector('[data-testid="wiki-editor-count"]')!.textContent!
    expect(line()).toContain('자')

    act(() => applyLanguage('en'))
    expect(line()).toContain('characters')
    expect(line()).not.toMatch(/[가-힣]/)
  })
})
