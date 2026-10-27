// @vitest-environment jsdom
// 설정 → 고급 → 문제 해결의 진단 정보 — 취소는 조용히, 실패는 무엇이 안 됐는지와 원문을, 저장은 파일 이름을 알린다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AppApiDiagnostics, DiagnosticsState } from '../../../shared/ipc-contract'
import DiagnosticsSection from './diagnostics-section'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

const OFF: DiagnosticsState = { developerMode: false, traceStartedAt: null }
const ON: DiagnosticsState = { developerMode: true, traceStartedAt: null }

const mount = async (api: Partial<AppApiDiagnostics>): Promise<HTMLElement> => {
  ;(window as unknown as { api: unknown }).api = {
    exportDiagnostics: vi.fn(() => Promise.resolve(null)),
    openLogsFolder: vi.fn(() => Promise.resolve('')),
    getDiagnosticsState: vi.fn(() => Promise.resolve(OFF)),
    getProcessMetrics: vi.fn(() =>
      Promise.resolve([{ pid: 7, type: 'Tab', name: 'renderer', cpuPercent: 3.5, memoryMB: 120 }])
    ),
    ...api
  }
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  await act(async () => root.render(<DiagnosticsSection />))
  return el
}

const click = async (el: HTMLElement, testId: string): Promise<void> => {
  const button = el.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)
  await act(async () => button?.click())
}

const text = (el: HTMLElement, testId: string): string | null | undefined =>
  el.querySelector(`[data-testid="${testId}"]`)?.textContent

describe('DiagnosticsSection', () => {
  it('보내기 전에 보관함 글이 들어갈 수 있다고 알린다', async () => {
    const el = await mount({})
    expect(text(el, 'diagnostics-section')).toContain('기록에 보관함 글 일부가 들어갈 수 있어요')
  })

  it('저장하면 파일 이름을 알리고 전체 경로는 툴팁에 둔다', async () => {
    const el = await mount({
      exportDiagnostics: () => Promise.resolve('/Users/me/Downloads/2nd-brain-진단-1.zip')
    })
    await click(el, 'diagnostics-export')
    const note = el.querySelector('[data-testid="diagnostics-note"]')
    expect(note?.textContent).toBe('2nd-brain-진단-1.zip 파일로 저장했어요')
    expect(note?.getAttribute('title')).toBe('/Users/me/Downloads/2nd-brain-진단-1.zip')
  })

  it('저장을 취소하면 아무것도 알리지 않는다', async () => {
    const el = await mount({ exportDiagnostics: () => Promise.resolve(null) })
    await click(el, 'diagnostics-export')
    expect(text(el, 'diagnostics-note')).toBe('')
    expect(el.querySelector('[data-testid="diagnostics-export-failed"]')).toBeNull()
  })

  it('쓰지 못하면 무엇이 안 됐는지와 원문을 보인다', async () => {
    const el = await mount({
      exportDiagnostics: () => Promise.reject(new Error('ENOSPC: no space left on device'))
    })
    await click(el, 'diagnostics-export')
    expect(text(el, 'diagnostics-export-failed')).toContain('진단 정보를 내보내지 못했어요')
    expect(text(el, 'diagnostics-export-failed')).toContain('ENOSPC')
  })

  it('기록 폴더를 못 열면 원문과 함께 알린다', async () => {
    const el = await mount({ openLogsFolder: () => Promise.resolve('Failed to open path') })
    await click(el, 'diagnostics-open-logs')
    expect(text(el, 'diagnostics-open-logs-failed')).toContain('진단 기록 폴더를 열지 못했어요')
    expect(text(el, 'diagnostics-open-logs-failed')).toContain('Failed to open path')
  })
})

describe('DeveloperModeSection', () => {
  it('꺼져 있으면 개발자 손잡이를 보이지 않고 프로세스도 읽지 않는다', async () => {
    const getProcessMetrics = vi.fn(() => Promise.resolve([]))
    const el = await mount({ getProcessMetrics })
    expect(el.querySelector('[data-testid="diagnostics-devtools"]')).toBeNull()
    expect(el.querySelector('[data-testid="diagnostics-metrics"]')).toBeNull()
    expect(getProcessMetrics).not.toHaveBeenCalled()
  })

  it('켜면 저장을 main 에 맡기고 프로세스 표를 그린다', async () => {
    const setDeveloperMode = vi.fn(() => Promise.resolve(ON))
    // 처음은 꺼짐, 켠 뒤 다시 읽으면 켜짐
    const getDiagnosticsState = vi
      .fn<() => Promise<DiagnosticsState>>()
      .mockResolvedValueOnce(OFF)
      .mockResolvedValue(ON)
    const el = await mount({ setDeveloperMode, getDiagnosticsState })
    await click(el, 'diagnostics-developer-mode')
    expect(setDeveloperMode).toHaveBeenCalledWith(true)
    const row = el.querySelector('[data-testid="diagnostics-metrics"] tbody tr')
    expect(row?.textContent).toContain('renderer')
    expect(row?.textContent).toContain('120MB')
  })

  it('저장하지 못하면 꺼진 채 무엇이 안 됐는지 보인다', async () => {
    const el = await mount({
      setDeveloperMode: () => Promise.reject(new Error('EACCES settings.json'))
    })
    await click(el, 'diagnostics-developer-mode')
    expect(text(el, 'developer-mode-failed')).toContain('개발자 모드를 바꾸지 못했어요')
    expect(el.querySelector('[data-testid="diagnostics-metrics"]')).toBeNull()
  })

  it('기록 중이면 경과 시간을, 멈추면 저장한 파일 이름을 알린다', async () => {
    const stopTrace = vi.fn(() => Promise.resolve('/u/logs/trace-20261024-130000.json'))
    const getDiagnosticsState = vi
      .fn<() => Promise<DiagnosticsState>>()
      .mockResolvedValueOnce({ developerMode: true, traceStartedAt: Date.now() })
      .mockResolvedValue(ON)
    const el = await mount({ getDiagnosticsState, stopTrace })
    expect(text(el, 'diagnostics-trace-note')).toContain('기록 중')
    await click(el, 'diagnostics-trace-stop')
    expect(stopTrace).toHaveBeenCalledTimes(1)
    expect(text(el, 'diagnostics-trace-note')).toBe('trace-20261024-130000.json 파일로 저장했어요')
    expect(el.querySelector('[data-testid="diagnostics-trace-start"]')).not.toBeNull()
  })

  it('기록을 멈추지 못해도 main 상태로 버튼을 맞추고 원문을 보인다', async () => {
    const getDiagnosticsState = vi
      .fn<() => Promise<DiagnosticsState>>()
      .mockResolvedValueOnce({ developerMode: true, traceStartedAt: Date.now() })
      .mockResolvedValue(ON)
    const el = await mount({
      getDiagnosticsState,
      stopTrace: () => Promise.reject(new Error('trace write failed'))
    })
    await click(el, 'diagnostics-trace-stop')
    expect(text(el, 'developer-mode-failed')).toContain('trace write failed')
    expect(el.querySelector('[data-testid="diagnostics-trace-start"]')).not.toBeNull()
  })

  it('끄면서 닫은 성능 기록은 손잡이가 사라져도 알린다', async () => {
    const el = await mount({
      getDiagnosticsState: vi.fn(() => Promise.resolve(ON)),
      setDeveloperMode: () => Promise.resolve({ ...OFF, savedTrace: '/u/logs/trace-1.json' })
    })
    // 다시 읽기도 꺼진 상태를 준다
    ;(window as unknown as { api: { getDiagnosticsState: unknown } }).api.getDiagnosticsState =
      () => Promise.resolve(OFF)
    await click(el, 'diagnostics-developer-mode')
    expect(el.querySelector('[data-testid="diagnostics-trace-start"]')).toBeNull()
    expect(text(el, 'diagnostics-trace-note')).toBe('trace-1.json 파일로 저장했어요')
  })

  it('상태를 못 읽어도 스위치는 잠기지 않고 이유를 보인다', async () => {
    const el = await mount({ getDiagnosticsState: () => Promise.reject(new Error('ipc down')) })
    const box = el.querySelector<HTMLButtonElement>('[data-testid="diagnostics-developer-mode"]')
    expect(box?.disabled).toBe(false)
    expect(text(el, 'developer-mode-failed')).toContain('개발자 모드 상태를 읽지 못했어요')
  })
})
