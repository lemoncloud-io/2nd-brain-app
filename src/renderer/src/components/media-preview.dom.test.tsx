// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MediaPreview } from './media-preview'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// 폴백 버튼이 플랫폼 이름을 물어본다 — preload 없이 그리는 만큼만 흉내 낸다
;(window as unknown as { api: Record<string, unknown> }).api = {
  getAppInfo: () => Promise.resolve({ platform: 'darwin' }),
  openInObsidian: () => Promise.resolve(),
  revealInFinder: () => Promise.resolve()
}

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

const mount = (rel: string): { container: HTMLDivElement; show: (rel: string) => void } => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  const show = (next: string): void => {
    act(() => root.render(<MediaPreview key={next} rel={next} kind="audio" />))
  }
  show(rel)
  return { container, show }
}

const fail = (container: HTMLDivElement): void => {
  const audio = container.querySelector('[data-testid="sources-audio"]')
  act(() => audio?.dispatchEvent(new Event('error', { bubbles: false })))
}

describe('MediaPreview 의 재생 실패', () => {
  it('못 읽는 파일은 Obsidian 으로 가는 길을 준다', () => {
    const { container } = mount('raw/깨진.mkv')
    fail(container)
    expect(container.querySelector('[data-testid="sources-media-error"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="sources-open-obsidian"]')).not.toBeNull()
  })

  it('다른 파일로 바뀌면 다시 해 본다 — 앞 파일의 실패가 남지 않는다', () => {
    const { container, show } = mount('raw/깨진.mkv')
    fail(container)
    expect(container.querySelector('[data-testid="sources-media-error"]')).not.toBeNull()
    show('raw/멀쩡한.mp3')
    expect(container.querySelector('[data-testid="sources-media-error"]')).toBeNull()
    expect(container.querySelector('[data-testid="sources-audio"]')).not.toBeNull()
  })
})
