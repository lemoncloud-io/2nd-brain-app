// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useVaultText } from './use-vault-text'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const Probe = ({ rel }: { rel: string }): React.JSX.Element => {
  const { text, error } = useVaultText(rel)
  if (error) return <p data-testid="error">{error.text}</p>
  return <p data-testid="text">{text ?? '불러오는 중'}</p>
}

const show = async (rel: string): Promise<HTMLDivElement> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<Probe rel={rel} />)
  })
  return container
}

describe('useVaultText', () => {
  it('받은 글자를 돌려준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('본문이다', { status: 200 })))
    )
    const container = await show('raw/a.txt')
    expect(container.querySelector('[data-testid="text"]')?.textContent).toBe('본문이다')
  })

  it('거절당하면 안내로 바꾼다 — 상한을 넘은 파일이 빈 화면이 되지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('forbidden', { status: 403 })))
    )
    const container = await show('raw/big.json')
    expect(container.querySelector('[data-testid="error"]')?.textContent).toContain(
      '자료를 읽지 못했어요'
    )
  })

  it('15초 안에 안 오면 안내로 바꾼다 — 불러오는 중에 갇히지 않는다', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise<Response>(() => {}))
      )
      const container = await show('raw/slow.txt')
      expect(container.querySelector('[data-testid="text"]')?.textContent).toBe('불러오는 중')
      await act(async () => {
        vi.advanceTimersByTime(15000)
      })
      expect(container.querySelector('[data-testid="error"]')?.textContent).toContain(
        '자료를 읽지 못했어요'
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
