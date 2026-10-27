// @vitest-environment jsdom
// 설정 → AI 설정 — 엔진과 모델 하나. 용도별 칸은 없고, 목록에 없는 이름은 '고급' 에서 넣는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EngineSettings } from '../../../shared/engine-settings'
import EngineSection from './engine-section'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
const setEngineSettings = vi.fn<(next: EngineSettings) => Promise<EngineSettings>>()

// 가짜 main — 저장한 값을 다음 읽기가 돌려준다(진짜 settings.json 처럼)
const mount = async (loaded: EngineSettings): Promise<HTMLElement> => {
  let stored = loaded
  ;(window as unknown as { api: unknown }).api = {
    getEngineSettings: () => Promise.resolve(stored),
    setEngineSettings: (next: EngineSettings) =>
      setEngineSettings(next).then((saved) => {
        stored = saved
        return saved
      })
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(<EngineSection />))
  return container
}

const byTestId = (container: HTMLElement, id: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${id}"]`)

const choose = (select: HTMLSelectElement, value: string): void => {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

beforeEach(() => {
  setEngineSettings.mockReset().mockImplementation((next) => Promise.resolve(next))
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

describe('EngineSection', () => {
  it('모델 칸은 하나다 — 용도별 칸과 자체 고급 접기가 없다', async () => {
    const container = await mount({ engine: 'claude' })
    expect(byTestId(container, 'engine-model')).not.toBeNull()
    expect(byTestId(container, 'engine-model:chat')).toBeNull()
    expect(byTestId(container, 'engine-advanced-toggle')).toBeNull()
  })

  it('목록에서 고르는 즉시 그 모델 하나를 저장한다 — 따로 누를 저장 단추가 없다', async () => {
    const container = await mount({ engine: 'claude' })
    expect(byTestId(container, 'engine-save')).toBeNull()
    await act(async () =>
      choose(byTestId(container, 'engine-model') as HTMLSelectElement, 'sonnet')
    )
    expect(setEngineSettings).toHaveBeenCalledWith({ engine: 'claude', model: 'sonnet' })
  })

  it('저장이 도는 동안 엔진 단추와 모델 목록을 잠근다 — 늦게 온 저장이 앞선 선택을 덮지 않게', async () => {
    let finish: (value: EngineSettings) => void = () => undefined
    setEngineSettings.mockImplementation(
      () => new Promise<EngineSettings>((resolve) => (finish = resolve))
    )
    const container = await mount({ engine: 'claude' })
    const select = byTestId(container, 'engine-model') as HTMLSelectElement
    await act(async () => choose(select, 'sonnet'))
    expect((byTestId(container, 'engine-kind:codex') as HTMLButtonElement).disabled).toBe(true)
    expect(select.disabled).toBe(true)
    await act(async () => finish({ engine: 'claude', model: 'sonnet' }))
    expect((byTestId(container, 'engine-kind:codex') as HTMLButtonElement).disabled).toBe(false)
    expect(select.disabled).toBe(false)
  })

  it('고급에서 넣은 이름은 목록에 그 이름으로 고른 채 보인다', async () => {
    const container = await mount({ engine: 'claude', model: 'claude-opus-5[1m]' })
    const select = byTestId(container, 'engine-model') as HTMLSelectElement
    expect(select.value).toBe('claude-opus-5[1m]')
    expect(select.selectedOptions[0]?.textContent).toContain('고급')
  })

  it('Codex 는 고를 목록이 없어 기본 모델이라고만 말한다', async () => {
    const container = await mount({ engine: 'codex' })
    expect(byTestId(container, 'engine-model')).toBeNull()
    expect(byTestId(container, 'engine-model-note')?.textContent).toContain('기본 모델')
  })

  it('엔진 단추는 누르는 즉시 엔진만 저장해 모델을 비운다 — Claude 별칭은 Codex 에 통하지 않는다', async () => {
    const container = await mount({ engine: 'claude', model: 'sonnet' })
    await act(async () => byTestId(container, 'engine-kind:codex')?.click())
    expect(setEngineSettings).toHaveBeenCalledWith({ engine: 'codex' })
  })

  it('다른 모델을 고르면 그 모델이 저장되고 고급에서 넣은 이름은 목록에서 빠진다', async () => {
    const container = await mount({ engine: 'claude', model: 'claude-opus-5[1m]' })
    const select = byTestId(container, 'engine-model') as HTMLSelectElement
    await act(async () => choose(select, 'sonnet'))
    expect(select.value).toBe('sonnet')
    expect([...select.options].map((o) => o.value)).not.toContain('claude-opus-5[1m]')
  })

  it('저장이 실패하면 고른 값을 저장된 값으로 되돌리고 이유를 보인다', async () => {
    setEngineSettings.mockRejectedValue(new Error('disk full'))
    const container = await mount({ engine: 'claude', model: 'opus' })
    const select = byTestId(container, 'engine-model') as HTMLSelectElement
    await act(async () => choose(select, 'sonnet'))
    expect(select.value).toBe('opus')
    expect(byTestId(container, 'engine-save-status')?.getAttribute('role')).toBe('alert')
  })

  it('엔진을 누르면 저장이 끝나기 전에도 그 엔진이 눌린 채로 보인다', async () => {
    setEngineSettings.mockImplementation(() => new Promise<EngineSettings>(() => undefined))
    const container = await mount({ engine: 'claude' })
    await act(async () => byTestId(container, 'engine-kind:codex')?.click())
    expect(byTestId(container, 'engine-kind:codex')?.getAttribute('aria-pressed')).toBe('true')
    expect(byTestId(container, 'engine-model')).toBeNull()
  })
})
