// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GraphErrorBoundary } from './graph-error-boundary'

let root: Root | null = null
let host: HTMLDivElement | null = null

const render = (node: React.ReactNode): void => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(node))
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.restoreAllMocks()
})

const Boom = (): React.JSX.Element => {
  throw new Error('WebGL 초기화 실패')
}

describe('GraphErrorBoundary', () => {
  it('자식이 그리다 죽으면 알리고 그 자리를 비운다', () => {
    const onError = vi.fn()
    // React 는 잡힌 오류도 콘솔에 찍는다 — 테스트 출력만 조용히 시킨다
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <GraphErrorBoundary onError={onError}>
        <Boom />
      </GraphErrorBoundary>
    )
    expect(onError).toHaveBeenCalledTimes(1)
    expect(host?.textContent).toBe('')
  })

  it('멀쩡한 자식은 그대로 그린다', () => {
    const onError = vi.fn()
    render(
      <GraphErrorBoundary onError={onError}>
        <p>그래프</p>
      </GraphErrorBoundary>
    )
    expect(onError).not.toHaveBeenCalled()
    expect(host?.textContent).toBe('그래프')
  })
})
