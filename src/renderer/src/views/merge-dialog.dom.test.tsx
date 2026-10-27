// @vitest-environment jsdom
// 합치기 창 — 제안(합친 글·두 원문·고칠 링크·지울 페이지)을 보이고, 받으면 받은 때의 해시로 합치며, 바로 되돌릴 수 있는가.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { MergeProposal } from '../../../shared/ipc-contract'
import { MergeDialog } from './merge-dialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const proposal: MergeProposal = {
  keep: { rel: 'wiki/ml.md', title: '머신러닝', text: '# 머신러닝\n지도학습\n', hash: 'h-keep' },
  drop: {
    rel: 'wiki/machine-learning.md',
    title: '기계학습',
    text: '# 기계학습\n비지도학습\n',
    hash: 'h-drop'
  },
  edits: [{ rel: 'wiki/a.md', count: 2 }],
  body: '# 머신러닝\n지도학습\n비지도학습\n'
}

const api = {
  mergePropose: vi.fn<(a: string, b: string) => Promise<MergeProposal | { error: string }>>(),
  mergeCancel: vi.fn(() => Promise.resolve()),
  mergeApply:
    vi.fn<
      (
        input: Record<string, string>
      ) => Promise<{ ok: true; commit: string; edited: number } | { error: string }>
    >(),
  mergeUndo: vi.fn<(commit: string) => Promise<{ ok: true } | { error: string }>>()
}
;(window as unknown as { api: typeof api }).api = api

let root: Root
let host: HTMLDivElement
const onClose = vi.fn()

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  onClose.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const byTestId = (id: string): HTMLElement | null => document.querySelector(`[data-testid="${id}"]`)

const open = async (): Promise<void> => {
  await act(async () =>
    root.render(<MergeDialog rels={['wiki/machine-learning.md', 'wiki/ml.md']} onClose={onClose} />)
  )
}

describe('MergeDialog', () => {
  it('제안을 보이고, 받으면 그때의 해시로 합치며, 바로 되돌린다', async () => {
    api.mergePropose.mockResolvedValue(proposal)
    api.mergeApply.mockResolvedValue({ ok: true, commit: 'c'.repeat(40), edited: 1 })
    api.mergeUndo.mockResolvedValue({ ok: true })
    await open()

    expect(api.mergePropose).toHaveBeenCalledWith('wiki/machine-learning.md', 'wiki/ml.md')
    expect(byTestId('merge-summary')?.textContent).toContain('기계학습')
    expect(byTestId('merge-summary')?.textContent).toContain('a(2곳)')
    expect(byTestId('merge-summary')?.textContent).toContain('기계학습은 지워요')
    expect(byTestId('merge-body')?.textContent).toContain('비지도학습')
    expect(byTestId('merge-keep')?.textContent).toContain('지도학습')
    expect(byTestId('merge-drop')?.textContent).toContain('# 기계학습')

    await act(async () => byTestId('merge-accept')?.click())
    expect(api.mergeApply).toHaveBeenCalledWith({
      keep: 'wiki/ml.md',
      drop: 'wiki/machine-learning.md',
      body: proposal.body,
      keepHash: 'h-keep',
      dropHash: 'h-drop'
    })
    expect(byTestId('merge-done')?.textContent).toContain('기계학습으로 찾아도 머신러닝이 열려요')
    // 합친 직후 초점은 되돌리기가 아니다 — Enter 한 번에 되돌려지지 않게
    expect(document.activeElement).toBe(byTestId('merge-open'))

    await act(async () => byTestId('merge-undo')?.click())
    expect(api.mergeUndo).toHaveBeenCalledWith('c'.repeat(40))
    expect(byTestId('merge-undone')).not.toBeNull()
  })

  it('합치기가 거절되면 이유를 보이고 다시 누를 수 있다', async () => {
    api.mergePropose.mockResolvedValue(proposal)
    api.mergeApply.mockResolvedValue({ error: '제안을 받는 사이 페이지가 바뀌었어요' })
    await open()
    await act(async () => byTestId('merge-accept')?.click())
    expect(byTestId('merge-apply-error')?.textContent).toContain('페이지가 바뀌었어요')
    expect((byTestId('merge-accept') as HTMLButtonElement).disabled).toBe(false)
  })

  it('합치는 중에는 Esc·그만두기로 닫히지 않는다', async () => {
    api.mergePropose.mockResolvedValue(proposal)
    api.mergeApply.mockReturnValue(new Promise(() => undefined))
    await open()
    await act(async () => byTestId('merge-accept')?.click())
    const cancel = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === '그만두기'
    )
    expect((cancel as HTMLButtonElement).disabled).toBe(true)
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(byTestId('merge-dialog')).not.toBeNull()
  })

  it('되돌리기가 거절되면 이유를 보이고 합친 상태로 둔다', async () => {
    api.mergePropose.mockResolvedValue(proposal)
    api.mergeApply.mockResolvedValue({ ok: true, commit: 'c'.repeat(40), edited: 1 })
    api.mergeUndo.mockResolvedValue({ error: '합친 뒤 다른 변경이 있어 바로 되돌릴 수 없어요' })
    await open()
    await act(async () => byTestId('merge-accept')?.click())
    await act(async () => byTestId('merge-undo')?.click())
    expect(byTestId('merge-undo-error')?.textContent).toContain('바로 되돌릴 수 없어요')
    expect(byTestId('merge-done')).not.toBeNull()
  })

  it('제안을 만들지 못하면 이유를 보이고, 만드는 중에 닫으면 멈춘다', async () => {
    api.mergePropose.mockResolvedValueOnce({ error: 'AI 답을 알아볼 수 없어요' })
    await open()
    expect(byTestId('merge-error')?.textContent).toContain('알아볼 수 없어요')

    act(() => root.unmount())
    root = createRoot(host)
    api.mergePropose.mockReturnValueOnce(new Promise(() => undefined))
    await open()
    await act(async () => byTestId('merge-close')?.click())
    expect(api.mergeCancel).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalled()
  })
})

describe('MergeDialog 스크롤 영역', () => {
  it('합친 글·두 원문 미리보기는 키보드로 닿는다', async () => {
    api.mergePropose.mockResolvedValue(proposal)
    await open()
    for (const id of ['merge-body', 'merge-keep', 'merge-drop']) {
      const pre = byTestId(id)
      expect(pre).not.toBeNull()
      expect(pre?.getAttribute('tabindex')).toBe('0')
    }
  })
})
