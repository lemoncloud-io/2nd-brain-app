// @vitest-environment jsdom
// 넣기 칸 — 주소 가져오기가 끝나면 결과 목록이 live 영역이라 성공·실패를 알린다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AddResult } from '../../../shared/ipc-contract'
import { ClipInputs } from './ClipSection'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const api = {
  clipUrl: vi.fn<(url: string) => Promise<AddResult>>(),
  clipFile: vi.fn<(srcPath: string) => Promise<AddResult>>(),
  filePathForFile: vi.fn<(file: File) => string>()
}
;(window as unknown as { api: typeof api }).api = api

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ''
})

const byTestId = (id: string): HTMLElement | null => document.querySelector(`[data-testid="${id}"]`)

const open = async (): Promise<void> => {
  await act(async () => {
    root.render(<ClipInputs />)
  })
}

const typeUrl = (value: string): void => {
  const input = byTestId('clip-url') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('ClipInputs', () => {
  it('가져오기가 끝나면 결과 목록이 live 영역이다', async () => {
    api.clipUrl.mockResolvedValue({ ok: true, path: 'Clippings/x.md' })
    await open()
    typeUrl('https://example.com/a')
    await act(async () => byTestId('clip-url-button')?.click())
    const item = byTestId('clip-result')
    expect(item?.textContent).toContain('자료에 담았어요')
    expect(item?.closest('[role="status"]')).not.toBeNull()
  })

  it('주소에서 Enter를 눌러도 가져오기가 나간다', async () => {
    api.clipUrl.mockResolvedValue({ ok: true, path: 'Clippings/x.md' })
    await open()
    typeUrl('https://example.com/a')
    await act(async () => {
      document
        .querySelector('[data-testid="clip-url-form"]')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(api.clipUrl).toHaveBeenCalledWith('https://example.com/a')
    expect(byTestId('clip-result')?.textContent).toContain('자료에 담았어요')
  })

  it('드롭 영역은 키보드로 파일을 고를 수 있다', async () => {
    await open()
    const zone = byTestId('clip-drop')!
    expect(zone.getAttribute('role')).toBe('button')
    expect(zone.getAttribute('tabindex')).toBe('0')
    expect(zone.getAttribute('aria-label')).toContain('파일')
    // 단추를 품지 않는다 — 중첩 상호작용은 스크린리더 위반이다
    expect(zone.querySelector('button')).toBeNull()
    // Enter가 파일 고르기를 연다
    const picker = document.querySelector('[data-testid="clip-picker"]') as HTMLElement
    const click = vi.spyOn(picker, 'click').mockImplementation(() => undefined)
    zone.focus()
    await act(async () => {
      zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(click).toHaveBeenCalled()
    click.mockRestore()
  })

  it('결과는 지울 수 있고, 종류는 사람 말로 보인다', async () => {
    api.clipUrl.mockResolvedValue({ ok: true, path: 'Clippings/x.md' })
    await open()
    expect(document.body.textContent).not.toContain('.md·.txt')
    expect(document.body.textContent).toContain('메모')
    typeUrl('https://example.com/a')
    await act(async () => byTestId('clip-url-button')?.click())
    expect(byTestId('clip-result')).not.toBeNull()
    await act(async () => byTestId('clip-results-clear')?.click())
    expect(byTestId('clip-result')).toBeNull()
  })

  it('실패해도 같은 live 목록에 이유가 든다', async () => {
    api.clipUrl.mockResolvedValue({ ok: false, reason: '주소를 열지 못했어요' })
    await open()
    typeUrl('https://example.com/broken')
    await act(async () => byTestId('clip-url-button')?.click())
    const item = byTestId('clip-result')
    expect(item?.textContent).toContain('주소를 열지 못했어요')
    expect(item?.closest('[role="status"]')).not.toBeNull()
    expect(item?.closest('[role="status"]')?.querySelector('button')).toBeNull()
  })

  it('넣는 동안 또 놓으면 두 번째는 무시된다 — 먼저 결과가 남는다', async () => {
    api.filePathForFile.mockImplementation((file: File) => `/tmp/${file.name}`)
    let resolveA!: (value: AddResult) => void
    api.clipFile.mockImplementation(
      () =>
        new Promise<AddResult>((resolve) => {
          resolveA = resolve
        })
    )
    await open()
    const zone = byTestId('clip-drop')!
    const drop = (name: string): void => {
      const file = new File(['x'], name, { type: 'text/plain' })
      const event = new Event('drop', { bubbles: true }) as Event & {
        dataTransfer: { files: File[] }
      }
      event.dataTransfer = { files: [file] }
      act(() => {
        zone.dispatchEvent(event)
      })
    }
    drop('a.md')
    await act(async () => {
      await Promise.resolve()
    })
    // 전제 고정: 첫 묶음이 진행 중(회전 표시)이어야 경쟁이다
    expect(byTestId('clip-drop')?.textContent).toContain('넣는 중')
    drop('b.md')
    await act(async () => {
      resolveA({ ok: true, path: 'Clippings/a.md' })
      await Promise.resolve()
    })
    expect(api.clipFile).toHaveBeenCalledTimes(1)
    expect(byTestId('clip-result')?.textContent).toContain('a.md')
  })
})
