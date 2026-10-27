// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(async () => ({ diagramType: 'flowchart' })),
  render: vi.fn(async () => ({ svg: '<svg data-fake="1"></svg>' }))
}))
vi.mock('mermaid', () => ({ default: mermaid }))
vi.mock('katex/dist/katex.min.css', () => ({}))

import { ChatMarkdown, MermaidErrorBoundary } from './chat-markdown'
import { vaultFileIndex } from './chat-paths'
import { applyLanguage } from './i18n'

// React 19 act 경고를 끄는 전역 플래그
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

const mount = (): { container: HTMLDivElement; root: Root } => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  return { container, root }
}

const flush = async (): Promise<void> => {
  // 동적 import·parse·render 프라미스가 끝날 때까지 몇 번 양보한다
  for (let i = 0; i < 5; i++) await act(async () => undefined)
}

const answer = '```mermaid\ngraph TD; A-->B\n```'

describe('ChatMarkdown mermaid (DOM)', () => {
  it('스트리밍 중에는 mermaid 를 그리지 않고, 답이 끝나면 한 번 그린다', async () => {
    const { container, root } = mount()
    act(() =>
      root.render(<ChatMarkdown text={answer} streaming onOpenExternal={() => undefined} />)
    )
    await flush()
    expect(mermaid.render).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="chat-mermaid-pending"]')).not.toBeNull()

    act(() =>
      root.render(<ChatMarkdown text={answer} streaming={false} onOpenExternal={() => undefined} />)
    )
    await flush()
    expect(mermaid.render).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="chat-mermaid"] svg')).not.toBeNull()
  })

  it('문법이 틀리면 render 없이 원문 코드로 남는다', async () => {
    mermaid.parse.mockRejectedValueOnce(new Error('Parse error'))
    const { container, root } = mount()
    act(() => root.render(<ChatMarkdown text={answer} onOpenExternal={() => undefined} />))
    await flush()
    expect(mermaid.render).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="chat-mermaid-fallback"]')?.textContent).toContain(
      'graph TD'
    )
  })

  // 밝은 면 색으로 그린 그림은 어두운 바탕에서 흰 상자로 뜬다 — 테마를 바꾸면 그 짝으로 다시 그린다
  it('어두운 테마에서는 어두운 짝으로 그리고, 밝게 돌리면 기본 설정으로 다시 그린다', async () => {
    const onOpen = (): void => undefined
    const { root } = mount()
    act(() => root.render(<ChatMarkdown text={answer} onOpenExternal={onOpen} />))
    await flush()
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ theme: expect.anything() })
    )

    await act(async () => document.documentElement.classList.add('dark'))
    await flush()
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'redux-dark-color', darkMode: true })
    )
    expect(mermaid.render).toHaveBeenCalledTimes(2)

    await act(async () => document.documentElement.classList.remove('dark'))
    await flush()
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ theme: expect.anything() })
    )
    expect(mermaid.render).toHaveBeenCalledTimes(3)
  })

  it('렌더가 던져도 경계가 원문 코드로 받는다', () => {
    const Boom = (): React.JSX.Element => {
      throw new Error('render boom')
    }
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { container, root } = mount()
      act(() =>
        root.render(
          <MermaidErrorBoundary code="graph TD; A-->B">
            <Boom />
          </MermaidErrorBoundary>
        )
      )
      expect(
        container.querySelector('[data-testid="chat-mermaid-fallback"]')?.textContent
      ).toContain('graph TD')
    } finally {
      silence.mockRestore()
    }
  })
})

describe('답 본문의 보관함 경로', () => {
  const files = vaultFileIndex(['outputs/report.html', 'wiki/a.md'])

  const show = (text: string, onOpenFile = vi.fn(), streaming = false): HTMLDivElement => {
    const { container, root } = mount()
    act(() =>
      root.render(
        <ChatMarkdown
          text={text}
          streaming={streaming}
          onOpenExternal={() => undefined}
          vaultFiles={files}
          onOpenFile={onOpenFile}
        />
      )
    )
    return container
  }

  it('인라인 코드가 보관함에 있는 파일이면 눌러서 연다 — 답이 오는 중에도', () => {
    const onOpenFile = vi.fn()
    const container = show('결과는 `outputs/report.html` 에 있어요', onOpenFile, true)
    const link = container.querySelector<HTMLElement>('[data-testid="chat-path"]')
    expect(link?.textContent).toBe('outputs/report.html')
    expect(link?.getAttribute('title')).toBe('outputs/report.html 열기')
    act(() => link?.click())
    expect(onOpenFile).toHaveBeenCalledWith('outputs/report.html')
  })

  it('보관함에 없는 경로와 그냥 코드는 글자로 남는다', () => {
    const container = show('`outputs/없음.html` 과 `npm test`')
    expect(container.querySelector('[data-testid="chat-path"]')).toBeNull()
    expect(container.querySelectorAll('code')).toHaveLength(2)
  })

  it('바깥 링크 글자 안의 경로를 눌러도 바깥 링크는 열리지 않는다', () => {
    const onOpenFile = vi.fn()
    const onOpenExternal = vi.fn()
    const { container, root } = mount()
    act(() =>
      root.render(
        <ChatMarkdown
          text="[`wiki/a.md`](https://example.com)"
          onOpenExternal={onOpenExternal}
          vaultFiles={files}
          onOpenFile={onOpenFile}
        />
      )
    )
    act(() => container.querySelector<HTMLElement>('[data-testid="chat-path"]')?.click())
    expect(onOpenFile).toHaveBeenCalledWith('wiki/a.md')
    expect(onOpenExternal).not.toHaveBeenCalled()
  })

  it('블록 코드 안의 경로는 링크가 되지 않는다', () => {
    const container = show('```\noutputs/report.html\n```')
    expect(container.querySelector('[data-testid="chat-path"]')).toBeNull()
    expect(container.querySelector('[data-testid="chat-code-block"]')).not.toBeNull()
  })

  it('파일 목록을 안 주면(아직 못 읽음) 링크 없이 코드 글자다', () => {
    const { container, root } = mount()
    act(() => root.render(<ChatMarkdown text="`wiki/a.md`" onOpenExternal={() => undefined} />))
    expect(container.querySelector('[data-testid="chat-path"]')).toBeNull()
    expect(container.querySelector('code')?.textContent).toBe('wiki/a.md')
  })
})

describe('ChatMarkdown 의 바깥 링크', () => {
  it('그냥 누르면 앱 안으로, ⌘/Ctrl 을 누르고 누르면 바깥으로 열라고 알린다', () => {
    const onOpenExternal = vi.fn()
    const { root, container } = mount()
    act(() =>
      root.render(
        <ChatMarkdown text="[바깥](https://a.example/)" onOpenExternal={onOpenExternal} />
      )
    )
    const link = container.querySelector('a')!
    act(() => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    act(() =>
      link.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
      )
    )
    expect(onOpenExternal.mock.calls).toEqual([
      ['https://a.example/', { external: false }],
      ['https://a.example/', { external: true }]
    ])
  })
})

describe('ChatMarkdown — language switch', () => {
  afterEach(() => applyLanguage('ko'))

  it('memo 된 답도 언어를 바꾸면 코드 복사·생각 문구가 바뀐다', () => {
    const { container, root } = mount()
    const onOpenExternal = vi.fn()
    act(() =>
      root.render(
        <ChatMarkdown
          text={'```ts\nconst a = 1\n```'}
          thinking="음"
          onOpenExternal={onOpenExternal}
        />
      )
    )
    const copy = (): string | null =>
      container.querySelector('[data-testid="chat-code-copy"]')!.getAttribute('aria-label')
    expect(copy()).toBe('코드 복사')
    expect(container.textContent).toContain('생각')
    act(() => applyLanguage('en'))
    expect(copy()).toBe('Copy code')
    expect(container.textContent).toContain('Thoughts')
  })
})
