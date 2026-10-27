// @vitest-environment jsdom
// 검토 항목 구역 — 보고 있는 동안 페이지가 생기면 목록을 다시 받아 정리된 항목이 빠지는가.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ReviewItem } from '../../../shared/ipc-contract'
import { useWorkbench } from '../store/workbench'
import { ReviewItemsSection } from './review-items-section'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const missing: ReviewItem = {
  id: 'm1',
  source: 'ai-lint',
  kind: 'missing-page',
  title: '머신 러닝',
  detail: '',
  rel: 'wiki/a.md',
  createdAt: 0,
  dismissed: false
}

let onChanged: (rels: string[]) => void = () => undefined
const api = {
  listReviewItems: vi.fn<() => Promise<ReviewItem[]>>(),
  listDismissedReviewItems: vi.fn<() => Promise<ReviewItem[]>>(),
  dismissReviewItem: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  restoreReviewItem: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  onWikiChanged: vi.fn((listener: (rels: string[]) => void) => {
    onChanged = listener
    return () => undefined
  })
}
;(window as unknown as { api: typeof api }).api = api

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  useWorkbench.setState(useWorkbench.getInitialState())
  api.listReviewItems.mockReset()
  api.listDismissedReviewItems.mockReset().mockResolvedValue([])
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('ReviewItemsSection', () => {
  it('보고 있는 동안 페이지가 생기면 다시 받아, 정리된 빠진 페이지 항목이 사라진다', async () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'review' })
    api.listReviewItems.mockResolvedValueOnce([missing]).mockResolvedValueOnce([])
    await act(async () => root.render(<ReviewItemsSection />))
    expect(host.textContent).toContain('머신 러닝')

    await act(async () => onChanged(['wiki/머신 러닝.md']))
    expect(api.listReviewItems).toHaveBeenCalledTimes(2)
    expect(host.textContent).not.toContain('머신 러닝')
  })

  it('다른 화면에 있을 때 페이지가 바뀌면 다시 받지 않는다(들어올 때 받는다)', async () => {
    useWorkbench.setState({ view: 'doc', knowledgeSection: 'review' })
    api.listReviewItems.mockResolvedValue([missing])
    await act(async () => root.render(<ReviewItemsSection />))
    await act(async () => onChanged(['wiki/x.md']))
    expect(api.listReviewItems).not.toHaveBeenCalled()

    // 보관함이 바뀌면(빈 목록 신호) 보이지 않아도 다시 받는다
    await act(async () => onChanged([]))
    expect(api.listReviewItems).toHaveBeenCalledOnce()
  })

  it('항목이 없으면 제자리에서 옅은 머리글 한 줄로 접히고, 생기면 펼쳐진다', async () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'review' })
    api.listReviewItems.mockResolvedValueOnce([]).mockResolvedValueOnce([missing])
    await act(async () => root.render(<ReviewItemsSection />))
    const heading = (): HTMLElement =>
      host.querySelector<HTMLElement>('[data-testid="review-items-heading"]')!
    expect(heading().textContent).toBe('검토 항목 없음')
    expect(host.querySelector('[data-testid="review-items"]')!.className).not.toContain('order')
    await act(async () => onChanged([]))
    expect(heading().textContent).toBe('검토 항목')
    expect(host.textContent).toContain('머신 러닝')
  })

  it('연결된 문서가 없는 항목은 막힌 단추 대신 이유를 보인다', async () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'review' })
    api.listReviewItems.mockResolvedValue([
      { ...missing, id: 'r0', rel: null, detail: '두 페이지가 같은 말을 해요' }
    ])
    await act(async () => root.render(<ReviewItemsSection />))
    // 눌러도 안 되는 단추는 고장처럼 보인다 — 아예 두지 않는다
    expect(host.querySelector('[disabled]')).toBeNull()
    expect(host.textContent).toContain('연결된 문서가 없어 여기서 열 수 없어요')
    expect(host.textContent).toContain('두 페이지가 같은 말을 해요')
  })

  it('읽는 중에는 빈 말 대신 기다림을 보인다', async () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'review' })
    let resolve: (items: ReviewItem[]) => void = () => undefined
    api.listReviewItems.mockReturnValue(
      new Promise<ReviewItem[]>((r) => {
        resolve = r
      })
    )
    await act(async () => root.render(<ReviewItemsSection />))
    expect(host.querySelector('[data-testid="review-items-loading"]')).not.toBeNull()
    await act(async () => resolve([]))
    expect(host.querySelector('[data-testid="review-items-loading"]')).toBeNull()
    expect(host.textContent).toContain('검토 항목 없음')
  })

  it('나중에로 보내면 어디로 갔는지 한 줄 알린다', async () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'review' })
    api.listReviewItems.mockResolvedValue([missing])
    await act(async () => root.render(<ReviewItemsSection />))
    await act(async () => {
      host.querySelector<HTMLElement>('[data-testid="review-item-dismiss:m1"]')?.click()
    })
    expect(host.querySelector('[data-testid="review-items-moved"]')?.textContent).toContain(
      '나중에 보기로 옮겼어요'
    )
  })
})

describe('ReviewItemsSection 나중에 보기 목록 실패', () => {
  it('되돌리기 목록을 못 읽으면 침묵 대신 작은 실패 한 줄을 보인다', async () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'review' })
    api.listReviewItems.mockResolvedValueOnce([])
    api.listDismissedReviewItems.mockRejectedValueOnce(new Error('boom'))
    await act(async () => root.render(<ReviewItemsSection />))
    // 미뤄둔 항목이 없는 것처럼 보이면 안 된다 — 실패를 알린다
    expect(host.querySelector('[data-testid="review-items-hidden"]')).toBeNull()
    expect(host.querySelector('[data-testid="review-items-hidden-error"]')).not.toBeNull()
  })
})

describe('ReviewItemsSection 나중에 보기 목록 실패 — 낡은 목록', () => {
  const hiddenItem: ReviewItem = {
    id: 'h1',
    source: 'verify',
    kind: 'missing-page',
    title: '낡은 항목',
    detail: '',
    rel: 'wiki/h.md',
    createdAt: 0,
    dismissed: true
  }

  it('실패해도 이전 목록은 남고 낡음 표시가 붙는다', async () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'review' })
    api.listReviewItems.mockResolvedValue([])
    api.listDismissedReviewItems
      .mockResolvedValueOnce([hiddenItem])
      .mockRejectedValueOnce(new Error('boom'))
    await act(async () => root.render(<ReviewItemsSection />))
    expect(host.querySelector('[data-testid="review-items-hidden"]')).not.toBeNull()
    // 다시 읽기(빈 목록 신호)가 실패하면 목록은 그대로, 낡음만 표시
    await act(async () => onChanged([]))
    expect(host.querySelector('[data-testid="review-items-hidden"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="review-items-hidden-stale"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="review-items-hidden-error"]')).toBeNull()
  })

  it('나중 성공에 실패 표시가 지워진다', async () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'review' })
    api.listReviewItems.mockResolvedValue([])
    api.listDismissedReviewItems.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([])
    await act(async () => root.render(<ReviewItemsSection />))
    expect(host.querySelector('[data-testid="review-items-hidden-error"]')).not.toBeNull()
    await act(async () => onChanged([]))
    expect(host.querySelector('[data-testid="review-items-hidden-error"]')).toBeNull()
  })
})
