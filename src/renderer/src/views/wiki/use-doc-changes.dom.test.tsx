// @vitest-environment jsdom
// 늦게 온 답이 새 기준의 표시를 덮지 않는가, 그리고 리더가 든 것과 다른 내용을 견줬을 때 버리는가.
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  changedMidway,
  type ChangeSince,
  type DocChangesResult
} from '../../../../shared/ipc-contract'
import { useDocChanges } from './use-doc-changes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Answer = (result: DocChangesResult) => void

const pending: { key: string; answer: Answer }[] = []
const api = {
  docChanges: (rel: string, since: ChangeSince): Promise<DocChangesResult> =>
    new Promise((resolve) => {
      pending.push({
        key: `${rel}|${typeof since === 'object' ? since.change : since}`,
        answer: resolve
      })
    })
}
;(window as unknown as { api: typeof api }).api = api

// 답은 마이크로태스크로 돌아온다 — act 를 기다려야 그린 뒤를 본다
const answer = async (key: string, result: DocChangesResult): Promise<void> => {
  const found = pending.find((item) => item.key === key)
  if (!found) throw new Error(`묻지 않은 요청: ${key}`)
  await act(async () => {
    found.answer(result)
  })
}

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  pending.length = 0
  document.body.innerHTML = ''
})

const Probe = ({ since }: { since: ChangeSince }): React.JSX.Element => {
  const state = useDocChanges('private/note.md', since, 'hash-1')
  return (
    <p>
      {state.loading ? '묻는 중' : (state.unavailable ?? `더한 줄 ${state.changes?.added.length}`)}
    </p>
  )
}

const mount = (since: ChangeSince): { text: () => string; draw: (next: ChangeSince) => void } => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  const draw = (next: ChangeSince): void => {
    act(() => root.render(<Probe since={next} />))
  }
  draw(since)
  return { text: () => container.textContent ?? '', draw }
}

describe('useDocChanges', () => {
  it('기준을 바꾼 뒤 늦게 온 옛 답을 쓰지 않는다', async () => {
    const view = mount('today')
    view.draw('yesterday')
    expect(view.text()).toBe('묻는 중')

    await answer('private/note.md|today', {
      added: [{ from: 1, to: 9 }],
      removed: [],
      hash: 'hash-1'
    })
    expect(view.text()).toBe('묻는 중')

    await answer('private/note.md|yesterday', {
      added: [{ from: 2, to: 2 }],
      removed: [],
      hash: 'hash-1'
    })
    expect(view.text()).toBe('더한 줄 1')
  })

  it('리더가 든 것과 다른 내용을 견줬으면 그리지 않고 이유를 말한다 — 조용히 기다리면 굳는다', async () => {
    const view = mount('today')
    await answer('private/note.md|today', {
      added: [{ from: 1, to: 1 }],
      removed: [],
      hash: 'hash-2'
    })
    expect(view.text()).toBe(changedMidway())
  })

  it('기준 기록이 없으면 그 이유를 그대로 돌려준다', async () => {
    const view = mount('yesterday')
    await answer('private/note.md|yesterday', { unavailable: '어제 이전 기록이 없다' })
    expect(view.text()).toBe('어제 이전 기록이 없다')
  })
})
