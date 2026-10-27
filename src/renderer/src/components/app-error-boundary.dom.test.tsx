// @vitest-environment jsdom
// 앱 전체 경계 — 렌더 중 throw 가 화면을 통째로 지우지 않고 복구 화면을 보이며, 기록으로 보낸다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AppErrorBoundary } from './app-error-boundary'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
let exportResult: Promise<string | null> = Promise.resolve('/tmp/2nd-brain-진단-1.zip')

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const Boom = (): React.JSX.Element => {
  throw new Error('render crash for test')
}

const mount = async (
  child: React.JSX.Element
): Promise<{ el: HTMLElement; api: Record<string, ReturnType<typeof vi.fn>> }> => {
  const api = {
    reportError: vi.fn(() => Promise.resolve()),
    exportDiagnostics: vi.fn(() => exportResult)
  }
  ;(window as unknown as { api: unknown }).api = api
  // React 가 잡은 오류를 console 에 다시 찍는다 — 시험 출력만 시끄럽다
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  await act(async () => root.render(<AppErrorBoundary>{child}</AppErrorBoundary>))
  return { el, api }
}

describe('AppErrorBoundary', () => {
  it('오류가 없으면 자식을 그대로 그린다', async () => {
    const { el } = await mount(<p data-testid="ok">fine</p>)
    expect(el.querySelector('[data-testid="ok"]')).not.toBeNull()
    expect(el.querySelector('[data-testid="app-crash"]')).toBeNull()
  })

  it('렌더 중 throw 면 복구 화면을 보이고 오류와 컴포넌트 위치를 기록으로 보낸다', async () => {
    const { el, api } = await mount(<Boom />)
    expect(el.querySelector('[data-testid="app-crash"]')).not.toBeNull()
    expect(api.reportError).toHaveBeenCalledTimes(1)
    const report = api.reportError.mock.calls[0][0] as { message: string; stack?: string }
    expect(report.message).toBe('render: Error: render crash for test')
    expect(report.stack).toContain('Boom')
  })

  it('진단 정보 내보내기를 누르면 main 에 맡기고 저장한 파일 이름을 알린다', async () => {
    const { el, api } = await mount(<Boom />)
    const button = el.querySelector<HTMLButtonElement>('[data-testid="app-crash-export"]')
    await act(async () => button?.click())
    expect(api.exportDiagnostics).toHaveBeenCalledTimes(1)
    expect(el.querySelector('[data-testid="app-crash-export-note"]')?.textContent).toBe(
      '2nd-brain-진단-1.zip 파일로 저장했어요'
    )
    expect(el.querySelector('[data-testid="app-crash-export-failed"]')).toBeNull()
  })

  it('내보내지 못하면 무엇이 안 됐는지와 원문을 보인다', async () => {
    exportResult = Promise.reject(new Error('EACCES: permission denied'))
    exportResult.catch(() => {})
    const { el } = await mount(<Boom />)
    const button = el.querySelector<HTMLButtonElement>('[data-testid="app-crash-export"]')
    await act(async () => button?.click())
    const note = el.querySelector('[data-testid="app-crash-export-failed"]')
    expect(note?.textContent).toContain('진단 정보를 내보내지 못했어요')
    expect(note?.textContent).toContain('EACCES')
    exportResult = Promise.resolve('/tmp/2nd-brain-진단-1.zip')
  })

  it('복구 화면이 뜨면 초점이 제목으로 간다', async () => {
    const { el } = await mount(<Boom />)
    expect(document.activeElement).toBe(el.querySelector('h1'))
  })
})
