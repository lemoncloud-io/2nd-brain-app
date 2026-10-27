// @vitest-environment jsdom
// 리더 알림 — 그 문서에만 걸리고, 실행 취소 없는 알림은 잠깐 뒤 걷힌다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DOC_NOTICE_MS, useDocNotice, type DocNotice } from './doc-notice'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
// 그린 결과를 테스트에 내보내는 자리 — 렌더 뒤(effect)에 채운다
const probe: { shown: DocNotice | null; set: (notice: DocNotice | null) => void } = {
  shown: null,
  set: () => undefined
}

const Probe = ({ rel }: { rel: string | null }): null => {
  const [notice, setNotice] = useDocNotice(rel)
  useEffect(() => {
    probe.shown = notice
    probe.set = setNotice
  })
  return null
}

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
})

describe('useDocNotice', () => {
  it('다른 문서로 옮기면 지운다 — 실행 취소가 있는 알림도', () => {
    act(() => root.render(<Probe rel="wiki/a.md" />))
    act(() => probe.set({ rel: 'wiki/a.md', text: '되돌렸어요', undo: () => undefined }))
    expect(probe.shown?.text).toBe('되돌렸어요')
    act(() => root.render(<Probe rel="wiki/b.md" />))
    expect(probe.shown).toBeNull()
    // 돌아와도 되살아나지 않는다
    act(() => root.render(<Probe rel="wiki/a.md" />))
    expect(probe.shown).toBeNull()
  })

  it('이름을 바꾼 저장은 새 이름으로 세운 알림이 남는다', () => {
    act(() => root.render(<Probe rel="wiki/a.md" />))
    act(() => {
      probe.set({ rel: 'wiki/new.md', text: '저장했어요' })
      root.render(<Probe rel="wiki/new.md" />)
    })
    expect(probe.shown?.text).toBe('저장했어요')
  })

  it('실행 취소 없는 알림은 잠깐 뒤 걷히고, 실행 취소 알림은 남는다', () => {
    act(() => root.render(<Probe rel="wiki/a.md" />))
    act(() => probe.set({ rel: 'wiki/a.md', text: '저장했어요' }))
    act(() => vi.advanceTimersByTime(DOC_NOTICE_MS))
    expect(probe.shown).toBeNull()
    act(() => probe.set({ rel: 'wiki/a.md', text: '되돌렸어요', undo: () => undefined }))
    act(() => vi.advanceTimersByTime(DOC_NOTICE_MS * 3))
    expect(probe.shown?.text).toBe('되돌렸어요')
  })
})
