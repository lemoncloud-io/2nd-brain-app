// @vitest-environment jsdom
// 위키 초안 탭 — 초안 본문·경로 줄은 접힌 자세히로만, 진행 수는 main 이 실어 보낸 수로, 끝나면 결과가 맨 위.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EngineEvent, IngestOutcome } from '../../../shared/ipc-contract'
import { SetupContext } from '../hooks/use-setup'
import type { SetupState } from '../hooks/use-setup-state'
import { useWorkbench } from '../store/workbench'
import { IngestSection } from './IngestSection'
import { applyLanguage } from '../lib/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const VAULT = '/v'
const roots: Root[] = []

const setup = (): SetupState =>
  ({
    vault: 'ok',
    engine: 'ok',
    engineKind: 'claude',
    journey: { clippings: 1, ingested: false, merged: false },
    sync: { ahead: 0, aheadFiles: [], conflicts: [], running: false },
    refresh: vi.fn(),
    refreshJourney: vi.fn(),
    receiveTeamChanges: vi.fn(),
    refreshGithub: vi.fn()
  }) as unknown as SetupState

type Mounted = {
  container: HTMLElement
  emit: (event: EngineEvent) => void
  finish: (outcome: IngestOutcome) => Promise<void>
}

const mount = async (): Promise<Mounted> => {
  let listener: (event: EngineEvent) => void = () => undefined
  let resolve: (outcome: IngestOutcome) => void = () => undefined
  ;(window as unknown as { api: unknown }).api = {
    getVaultStatus: async () => ({ vaultDir: VAULT }),
    onWikiChanged: () => () => undefined,
    onIngestEvent: (next: (event: EngineEvent) => void) => {
      listener = next
      return () => undefined
    },
    startIngest: () => new Promise<IngestOutcome>((r) => (resolve = r)),
    cancelIngest: vi.fn()
  }
  useWorkbench.setState({ tree: null })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(
      <SetupContext.Provider value={setup()}>
        <IngestSection onOpenReview={vi.fn()} onRunningChange={vi.fn()} />
      </SetupContext.Provider>
    )
  })
  return {
    container,
    emit: (event) => act(() => listener(event)),
    finish: async (outcome) => {
      await act(async () => resolve(outcome))
    }
  }
}

afterEach(() => {
  act(() => applyLanguage('ko'))
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  delete (window as unknown as { api?: unknown }).api
  useWorkbench.setState(useWorkbench.getInitialState())
})

const byTestId = (container: HTMLElement, id: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${id}"]`)

describe('IngestSection', () => {
  it('언어를 바꾸면 이미 받은 기록 줄도 그 언어로 다시 쓴다', async () => {
    const { container, emit } = await mount()
    act(() => byTestId(container, 'ingest-start')!.click())
    emit({ type: 'done', ok: true } as EngineEvent)
    expect(byTestId(container, 'ingest-events')!.textContent).toBe('작업을 마쳤어요')

    act(() => applyLanguage('en'))

    expect(byTestId(container, 'ingest-events')!.textContent).toBe('Finished the task')
  })

  it('초안 본문·경로 줄은 자세히로만 가고, 진행은 main 이 센 수로 말한다', async () => {
    const { container, emit } = await mount()
    act(() => byTestId(container, 'ingest-start')!.click())
    emit({ type: 'phase', label: '초안 중', progress: { done: 0, total: 2, pages: 0 } })
    emit({ type: 'text', text: '@@ wiki/a.md\n---\ntype: concept\n---\n# 가' })
    emit({ type: 'file-change', path: `${VAULT}/wiki/a.md` })
    emit({ type: 'phase', label: '초안 중', progress: { done: 1, total: 2, pages: 1 } })

    const shown = byTestId(container, 'ingest-events')!
    expect(shown.textContent).toBe('초안 중')
    expect(shown.textContent).not.toContain('@@')
    expect(byTestId(container, 'ingest-raw')!.textContent).toContain('@@ wiki/a.md')
    expect(byTestId(container, 'ingest-raw')!.textContent).toContain('file-change wiki/a.md')
    expect(byTestId(container, 'ingest-summary')!.textContent).toBe(
      '자료 2개 중 1개 초안 마침 · 페이지 초안 1개'
    )
  })

  it('끝나면 결과 카드가 시작 버튼보다 위에 오고, 시작은 보조 버튼이 된다', async () => {
    const { container, finish } = await mount()
    act(() => byTestId(container, 'ingest-start')!.click())
    await finish({ status: 'succeeded', branch: 'app/ingest-2026-10-11' })

    const outcome = byTestId(container, 'ingest-outcome')!
    const start = byTestId(container, 'ingest-start')!
    expect(outcome.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(start.className).not.toContain('bg-primary')
  })

  it('실패하면 시작 버튼을 숨기고 카드의 다시 시도 하나만 둔다', async () => {
    const { container, finish } = await mount()
    act(() => byTestId(container, 'ingest-start')!.click())
    await finish({ status: 'failed', reason: '실패했어요' })
    expect(byTestId(container, 'ingest-outcome')!.textContent).toContain('다시 시도')
    expect(byTestId(container, 'ingest-start')).toBeNull()
  })

  it('끝나면 결과 카드의 글 영역이 live라 성공·실패를 알린다', async () => {
    const { container, finish } = await mount()
    act(() => byTestId(container, 'ingest-start')!.click())
    await finish({ status: 'succeeded', branch: 'app/ingest-2026-10-11' })
    const live = byTestId(container, 'ingest-outcome')!.querySelector('[role="status"]')!
    expect(live).not.toBeNull()
    expect(live.textContent).toContain('마쳤어요')
    // 실패 경로도 같은 글 영역이라 단추는 밖에 둔다 — 다시 시작해야 새 실행이 된다
    act(() => byTestId(container, 'ingest-start')!.click())
    await finish({ status: 'failed', reason: '실패했어요' })
    const relive = byTestId(container, 'ingest-outcome')!.querySelector('[role="status"]')!
    expect(relive.textContent).toContain('실패했어요')
    expect(relive.querySelector('button')).toBeNull()
  })

  it('멈추기 전송이 실패하면 단추가 돌아오고 이유를 말한다', async () => {
    const { container } = await mount()
    act(() => byTestId(container, 'ingest-start')!.click())
    ;(window as unknown as { api: { cancelIngest: () => Promise<void> } }).api.cancelIngest =
      async () => {
        throw new Error('끊겼어요')
      }
    act(() => byTestId(container, 'ingest-cancel')!.click())
    await act(async () => {
      await Promise.resolve()
    })
    const cancel = byTestId(container, 'ingest-cancel')!
    expect(cancel.textContent).toContain('멈추기')
    expect(cancel.hasAttribute('disabled')).toBe(false)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('멈추기')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('끊겼어요')
  })
})

describe('IngestSection start guard', () => {
  const countStarts = (): (() => number) => {
    const api = (
      window as unknown as {
        api: { startIngest: (arg?: { skipSync: boolean }) => Promise<IngestOutcome> }
      }
    ).api
    let calls = 0
    const inner = api.startIngest.bind(api)
    api.startIngest = (arg) => {
      calls += 1
      return inner(arg)
    }
    return () => calls
  }

  it('진행 중 외부 시작 요청이 와도 startIngest를 한 번만 부른다', async () => {
    const { container } = await mount()
    const calls = countStarts()
    act(() => byTestId(container, 'ingest-start')!.click())
    expect(calls()).toBe(1)
    act(() => {
      useWorkbench.getState().requestIngest()
    })
    expect(calls()).toBe(1)
  })

  it('같은 틱에 두 번 와도 startIngest를 한 번만 부른다', async () => {
    await mount()
    const calls = countStarts()
    act(() => {
      useWorkbench.getState().requestIngest()
      useWorkbench.getState().requestIngest()
    })
    expect(calls()).toBe(1)
  })
})
