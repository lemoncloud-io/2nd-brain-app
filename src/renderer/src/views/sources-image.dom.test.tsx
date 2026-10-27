// @vitest-environment jsdom
// 그림 배율 — 키(⌘/Ctrl = - 0)와 ⌘/Ctrl+휠이 단계 확대·축소·맞춤으로 간다. jsdom 의 navigator 는 Mac 이 아니라 Ctrl 이다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ImagePreview } from './sources-image'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

/** 원래 2000px 그림이 맞춤에서 500px(25%) 로 그려진 자리 */
const show = async (): Promise<HTMLElement> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(<ImagePreview rel="raw/a.png" alt="a.png" />))
  const img = container.querySelector<HTMLImageElement>('[data-testid="sources-image"]')!
  Object.defineProperty(img, 'naturalWidth', { value: 2000 })
  Object.defineProperty(img, 'clientWidth', { value: 500 })
  await act(async () => img.dispatchEvent(new Event('load')))
  return container
}

const level = (view: HTMLElement): string | null | undefined =>
  view.querySelector('[data-testid="image-zoom-level"]')?.textContent
const width = (view: HTMLElement): string | undefined =>
  view.querySelector<HTMLImageElement>('[data-testid="sources-image"]')?.style.width
const area = (view: HTMLElement): HTMLElement =>
  view.querySelector<HTMLElement>('[data-testid="sources-image-area"]')!

const key = async (view: HTMLElement, code: string, init: KeyboardEventInit = {}): Promise<void> =>
  act(async () => {
    area(view).dispatchEvent(
      new KeyboardEvent('keydown', { code, ctrlKey: true, bubbles: true, ...init })
    )
  })

describe('ImagePreview', () => {
  it('Ctrl+= 는 맞춤에서 그려진 배율(25%) 다음 단계로, Ctrl+- 는 아래로, Ctrl+0 은 맞춤으로', async () => {
    const view = await show()
    expect(level(view)).toBe('맞춤')
    await key(view, 'Equal')
    expect(level(view)).toBe('50%')
    expect(width(view)).toBe('1000px')
    await key(view, 'Minus')
    expect(level(view)).toBe('25%')
    await key(view, 'Digit0')
    expect(level(view)).toBe('맞춤')
    expect(width(view)).toBe('')
  })

  it('조합키 없이·Alt 를 같이 누른 키는 듣지 않는다', async () => {
    const view = await show()
    await key(view, 'Equal', { ctrlKey: false })
    await key(view, 'Equal', { altKey: true })
    expect(level(view)).toBe('맞춤')
  })

  it('Ctrl+휠은 스크롤 대신 배율을 바꾸고, 그냥 휠은 스크롤에 맡긴다', async () => {
    const view = await show()
    const wheel = (init: WheelEventInit): WheelEvent =>
      new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
    const plain = wheel({ deltaY: -100 })
    await act(async () => area(view).dispatchEvent(plain))
    expect(plain.defaultPrevented).toBe(false)
    expect(level(view)).toBe('맞춤')

    const zoomIn = wheel({ deltaY: -100, ctrlKey: true })
    await act(async () => area(view).dispatchEvent(zoomIn))
    expect(zoomIn.defaultPrevented).toBe(true)
    expect(level(view)).toBe('50%')
    await act(async () => area(view).dispatchEvent(wheel({ deltaY: 100, ctrlKey: true })))
    expect(level(view)).toBe('25%')
  })

  it('트랙패드처럼 작은 휠 여러 번은 첫 단계 뒤 100px 마다 한 단계 — 한 번 쓸었다고 끝까지 가지 않는다', async () => {
    // 한 몸짓 안 — 느린 머신에서 act 한 번이 300ms 를 넘어도 새 몸짓으로 갈라지지 않게 시계를 멈춘다
    vi.spyOn(performance, 'now').mockReturnValue(1_000)
    const view = await show()
    const swipe = async (count: number, deltaY: number): Promise<void> => {
      for (let i = 0; i < count; i++) {
        await act(async () =>
          area(view).dispatchEvent(
            new WheelEvent('wheel', { deltaY, ctrlKey: true, bubbles: true, cancelable: true })
          )
        )
      }
    }
    await swipe(20, -4)
    expect(level(view)).toBe('50%')
    await swipe(10, -4)
    expect(level(view)).toBe('75%')
  })

  it('마우스 한 칸(40px)도 쉬었다 굴리면 칸마다 한 단계', async () => {
    let now = 1_000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const view = await show()
    const notch = async (): Promise<void> =>
      act(async () => {
        area(view).dispatchEvent(
          new WheelEvent('wheel', { deltaY: -40, ctrlKey: true, bubbles: true, cancelable: true })
        )
      })
    await notch()
    expect(level(view)).toBe('50%')
    now += 500
    await notch()
    expect(level(view)).toBe('75%')
  })
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
