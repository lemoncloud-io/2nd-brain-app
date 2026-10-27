// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { WikilinkMarkdown } from '../lib/wikilink-markdown'
import { PREVIEW_MAX_CHARS, previewText } from '../lib/preview-text'

// React 19 act 경고를 끄는 전역 플래그
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
const reads: string[] = []

beforeEach(() => {
  vi.useFakeTimers()
  ;(window as unknown as { api: unknown }).api = {
    readWikiPage: async (rel: string) => {
      reads.push(rel)
      return {
        page: {
          rel,
          slug: 'b',
          title: 'B 페이지',
          frontmatter: null,
          body: 'B 의 본문',
          links: []
        },
        text: 'B 의 본문',
        hash: 'h'
      }
    }
  }
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  reads.length = 0
  delete (window as unknown as { api?: unknown }).api
  vi.useRealTimers()
})

const mount = (text: string, onNavigate: (rel: string) => void = () => {}): HTMLDivElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() =>
    root.render(
      <WikilinkMarkdown
        text={text}
        index={[
          { rel: 'wiki/b.md', slug: 'b' },
          { rel: 'wiki/chart.png', slug: 'chart.png' }
        ]}
        onNavigate={onNavigate}
        onOpenExternal={() => {}}
      />
    )
  )
  return container
}

const preview = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-testid="link-preview"]')

describe('링크 호버 미리보기', () => {
  it('링크에 잠시 머물면 그 페이지 본문을 띄운다 — 지나가기만 하면 뜨지 않는다', async () => {
    const container = mount('[[b]] 를 본다')
    const link = container.querySelector<HTMLElement>('[data-testid="wiki-link"]')!
    act(() => link.focus())
    act(() => vi.advanceTimersByTime(100))
    expect(preview()).toBeNull()
    act(() => vi.advanceTimersByTime(400))
    await act(async () => {
      await Promise.resolve()
    })
    expect(preview()?.dataset.rel).toBe('wiki/b.md')
    expect(reads).toEqual(['wiki/b.md'])
    // 본문에 제목 머리줄이 없으면 붙여서 무엇을 보는지 알린다
    expect(preview()?.querySelector('h1')?.textContent).toBe('B 페이지')
    expect(preview()?.textContent).toContain('B 의 본문')
  })

  it('링크를 떠나면 잠시 뒤 닫히고, Esc 는 바로 닫는다', async () => {
    const container = mount('[[b]]')
    const link = container.querySelector<HTMLElement>('[data-testid="wiki-link"]')!
    const open = async (): Promise<void> => {
      act(() => link.focus())
      act(() => vi.advanceTimersByTime(400))
      await act(async () => {
        await Promise.resolve()
      })
    }
    await open()
    expect(preview()).not.toBeNull()
    act(() => link.blur())
    act(() => vi.advanceTimersByTime(250))
    expect(preview()).toBeNull()
    await open()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(preview()).toBeNull()
  })

  it('누르면 미리보기와 상관없이 그 페이지로 간다', () => {
    const went: string[] = []
    const container = mount('[[b]]', (rel) => went.push(rel))
    act(() => container.querySelector<HTMLElement>('[data-testid="wiki-link"]')!.click())
    expect(went).toEqual(['wiki/b.md'])
  })

  it('md 가 아닌 링크에는 미리보기를 붙이지 않는다', () => {
    const container = mount('[[chart.png]]')
    act(() => container.querySelector<HTMLElement>('[data-testid="wiki-link"]')!.focus())
    act(() => vi.advanceTimersByTime(1000))
    expect(preview()).toBeNull()
    expect(reads).toEqual([])
  })
})

describe('previewText', () => {
  it('제목 머리줄이 있으면 그대로 둔다', () => {
    expect(previewText('# 이미 있음\n\n본문', '제목')).toEqual({
      text: '# 이미 있음\n\n본문',
      cut: false
    })
  })

  it('길면 상한 앞 줄 경계에서 자르고 잘렸다고 알린다', () => {
    const line = 'ㄱ'.repeat(99)
    const body = `# 제목\n${Array.from({ length: 100 }, () => line).join('\n')}`
    const { text, cut } = previewText(body, '제목')
    expect(cut).toBe(true)
    expect(text.length).toBeLessThanOrEqual(PREVIEW_MAX_CHARS)
    expect(text.endsWith(line)).toBe(true)
  })
})
