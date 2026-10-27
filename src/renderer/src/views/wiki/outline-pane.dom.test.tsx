// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { marksFor } from '../../lib/doc-marks'
import { OutlinePane } from './outline-pane'

// React 19 act 경고를 끄는 전역 플래그
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const NOTE = [
  '## 어제에서 넘어온 것',
  '- [x] 계약서',
  '- [ ] 회의록',
  '',
  '## 오늘 할 일',
  '- [x] 견적',
  '',
  '## 메모',
  '체크박스 없는 절'
].join('\n')

/** 리더의 스크롤 칸 — 목차는 이 안의 헤딩만 본다(다른 칸의 같은 이름표를 건드리지 않는다) */
const reader = (): HTMLDivElement => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

const mount = (
  text = NOTE,
  marks?: Parameters<typeof OutlinePane>[0]['marks'],
  scroll: HTMLDivElement = reader(),
  openOnly = false
): { container: HTMLDivElement; openOnly: boolean[] } => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  const openOnlyCalls: boolean[] = []
  act(() =>
    root.render(
      <OutlinePane
        text={text}
        marks={marks}
        openOnly={openOnly}
        onOpenOnly={(on) => openOnlyCalls.push(on)}
        scrollRef={{ current: scroll }}
      />
    )
  )
  return { container, openOnly: openOnlyCalls }
}

describe('OutlinePane', () => {
  it('절마다 이름과 체크박스 n/m 을 쓴다 — 체크박스 없는 절에는 수를 붙이지 않는다', () => {
    const { container } = mount()
    const rows = [...container.querySelectorAll('[data-testid^="outline-row:"]')]
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'outline-row:어제에서-넘어온-것',
      'outline-row:오늘-할-일',
      'outline-row:메모'
    ])
    expect(
      rows.map((row) => row.querySelector('[data-testid="outline-progress"]')?.textContent)
    ).toEqual(['1/2', '1/1', undefined])
  })

  it('누르면 그 절로 보낸다 — 리더가 헤딩에 붙인 이름표를 찾는다', () => {
    const scroll = reader()
    const heading = document.createElement('h2')
    heading.id = '오늘-할-일'
    const scrollIntoView = vi.fn()
    heading.scrollIntoView = scrollIntoView
    scroll.appendChild(heading)
    const { container } = mount(NOTE, undefined, scroll)

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="outline-row:오늘-할-일"]')?.click()
    })

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  // 채팅 칸의 근거 시트도 같은 이름표를 찍는다 — 목차는 제 리더 안만 본다
  it('다른 칸의 같은 이름표는 건드리지 않는다', () => {
    const elsewhere = document.createElement('h2')
    elsewhere.id = '오늘-할-일'
    const scrollIntoView = vi.fn()
    elsewhere.scrollIntoView = scrollIntoView
    document.body.appendChild(elsewhere)
    const { container } = mount()

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="outline-row:오늘-할-일"]')?.click()
    })

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('기준 시점 이후 바뀐 절에만 점을 찍는다', () => {
    // 6번째 줄(`- [x] 견적`)이 바뀌었다 — 그 줄은 "오늘 할 일" 절에 든다
    const { container } = mount(
      NOTE,
      marksFor(NOTE, { added: [{ from: 6, to: 6 }], removed: [] }, 0)
    )
    const dotted = [...container.querySelectorAll('[data-testid^="outline-row:"]')].filter(
      (row) => row.querySelector('[data-testid="outline-changed"]') !== null
    )
    expect(dotted.map((row) => row.getAttribute('data-testid'))).toEqual(['outline-row:오늘-할-일'])
  })

  it('"안 끝난 항목만" 을 누르면 켜라고 알린다', () => {
    const { container, openOnly } = mount()
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="outline-open-only"]')?.click()
    })
    expect(openOnly).toEqual([true])
  })

  it('"안 끝난 항목만" 토글은 머리 단추와 같은 32px이다', () => {
    const { container } = mount()
    const toggle = container.querySelector('[data-testid="outline-open-only"]')!
    expect(toggle.classList.contains('h-8')).toBe(true)
  })

  it('밝은 면에서 읽히는 Spark 글자를 쓴다 — 켜진 토글과 끝난 절 n/m 은 primary-ink 다', () => {
    const { container } = mount(NOTE, undefined, reader(), true)
    const toggle = container.querySelector('[data-testid="outline-open-only"]')!
    expect(toggle.classList.contains('text-primary-ink')).toBe(true)
    expect(toggle.classList.contains('text-primary')).toBe(false)
    const done = [...container.querySelectorAll('[data-testid="outline-progress"]')].find(
      (el) => el.textContent === '1/1'
    )!
    expect(done.classList.contains('text-primary-ink')).toBe(true)
    expect(done.classList.contains('text-primary')).toBe(false)
  })

  it('헤딩도 체크박스도 없는 글에는 목차를 띄우지 않는다', () => {
    expect(mount('짧은 메모 한 줄').container.innerHTML).toBe('')
  })

  it('헤딩이 하나뿐이어도 할 일이 있으면 띄운다', () => {
    const { container } = mount('## 오늘 할 일\n- [ ] 하나')
    expect(container.querySelector('[data-testid="outline-pane"]')).not.toBeNull()
  })

  // "안 끝난 항목만" 은 목차 안에만 있다 — 헤딩 없는 체크리스트에서 목차를 숨기면 닿을 길이 없다
  it('헤딩이 없어도 체크박스가 있으면 띄운다', () => {
    const { container } = mount('- [ ] 하나\n- [x] 둘')
    expect(container.querySelector('[data-testid="outline-open-only"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-testid^="outline-row:"]')).toHaveLength(0)
  })
})
