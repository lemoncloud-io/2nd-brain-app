// @vitest-environment jsdom
// 승인 — 행마다 승인/거절 버튼이 있고, 체크 해제가 거절이 되지 않는다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { WikiListEntry } from '../../../shared/ipc-contract'
import { SetupContext } from '../hooks/use-setup'
import type { SetupState } from '../hooks/use-setup-state'
import { useWorkbench } from '../store/workbench'
import { ReviewSection } from './ReviewSection'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

const setup = (remote: SetupState['remote'] = null): SetupState =>
  ({
    remote,
    vault: 'ok',
    engine: 'ok',
    engineKind: 'claude',
    journey: { clippings: 1, ingested: true, merged: false },
    sync: { ahead: 0, aheadFiles: [], conflicts: [], running: false },
    refresh: vi.fn(),
    refreshJourney: vi.fn(),
    receiveTeamChanges: vi.fn(),
    refreshGithub: vi.fn()
  }) as unknown as SetupState

const page = (rel: string): WikiListEntry => ({
  rel,
  slug: 'a',
  title: '가 페이지',
  frontmatter: null,
  links: [],
  mtimeMs: 0,
  size: 0
})

const mount = async (
  remote: SetupState['remote'] = null,
  extraApi: Record<string, unknown> = {}
): Promise<HTMLElement> => {
  ;(window as unknown as { api: unknown }).api = {
    ...extraApi,
    listReview: async () => ({
      branch: 'app/ingest-1',
      defaultBranch: 'main',
      pages: [{ path: 'wiki/a.md', slug: 'a', status: 'added' }],
      others: []
    }),
    listReviewItems: async () => [],
    listDismissedReviewItems: async () => [],
    onWikiChanged: () => () => undefined
  }
  useWorkbench.setState({
    view: 'knowledge',
    knowledgeSection: 'review',
    pages: [page('wiki/a.md')]
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(
      <SetupContext.Provider value={setup(remote)}>
        <ReviewSection />
      </SetupContext.Provider>
    )
  })
  return container
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  delete (window as unknown as { api?: unknown }).api
  useWorkbench.setState(useWorkbench.getInitialState())
})

const byTestId = (container: HTMLElement, id: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${id}"]`)

const click = (el: HTMLElement): void => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('ReviewSection', () => {
  it('행의 거절을 누르면 거절이 되고, 승인을 누르면 돌아온다 — 체크박스는 없다', async () => {
    const container = await mount()
    const approve = byTestId(container, 'review-approve-wiki/a.md')!
    const reject = byTestId(container, 'review-reject-wiki/a.md')!
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    expect(approve.getAttribute('aria-pressed')).toBe('true')
    click(reject)
    expect(byTestId(container, 'review-approve-wiki/a.md')!.getAttribute('aria-pressed')).toBe(
      'false'
    )
    expect(byTestId(container, 'review-reject-wiki/a.md')!.getAttribute('aria-pressed')).toBe(
      'true'
    )
    click(byTestId(container, 'review-approve-wiki/a.md')!)
    expect(byTestId(container, 'review-approve-wiki/a.md')!.getAttribute('aria-pressed')).toBe(
      'true'
    )
  })

  it('머리에는 새로고침·위키에 넣기만 — 전체 승인·거절은 목록 위 줄에 있다', async () => {
    const container = await mount()
    const header = container.querySelector('header')!
    expect(header.querySelector('[data-testid="review-finalize"]')).not.toBeNull()
    expect(header.querySelector('[data-testid="review-approve-all"]')).toBeNull()
    expect(header.querySelector('[data-testid="review-reject-all"]')).toBeNull()
    expect(byTestId(container, 'review-approve-all')).not.toBeNull()
  })

  it('행의 고른 단추는 중립 채움 — 주황(primary) 채움은 위키에 넣기 하나뿐이다', async () => {
    const container = await mount()
    expect(byTestId(container, 'review-approve-wiki/a.md')!.className).not.toContain('bg-primary')
    expect(byTestId(container, 'review-approve-wiki/a.md')!.querySelector('svg')).not.toBeNull()
    expect(byTestId(container, 'review-finalize')!.className).toContain('bg-primary')
  })

  it('읽기로 연 페이지를 센다 — 목록 위 줄과 확인 바가 읽어 본 수를 말한다', async () => {
    const container = await mount()
    expect(byTestId(container, 'review-read-count')!.textContent).toBe('읽어 본 0개 / 전체 1개')
    click(byTestId(container, 'review-open-wiki/a.md')!)
    expect(useWorkbench.getState().peek?.rel).toBe('wiki/a.md')
    expect(byTestId(container, 'review-read-count')!.textContent).toBe('읽어 본 1개 / 전체 1개')
    expect(byTestId(container, 'review-open-wiki/a.md')!.textContent).toBe('읽음')
    click(byTestId(container, 'review-finalize')!)
    expect(byTestId(container, 'review-confirm-read')!.textContent).toBe('읽어 본 1개 / 전체 1개')
  })

  it('팀 저장소에 연결돼 있으면 확인 바가 팀 확인 요청과 되돌리면 닫힌다는 것을 말한다', async () => {
    const solo = await mount()
    click(byTestId(solo, 'review-finalize')!)
    expect(byTestId(solo, 'review-confirm-team')).toBeNull()
    for (const root of roots.splice(0)) act(() => root.unmount())
    document.body.innerHTML = ''

    const team = await mount({
      url: 'https://github.com/t/v.git',
      webUrl: 'https://github.com/t/v'
    })
    click(byTestId(team, 'review-finalize')!)
    expect(byTestId(team, 'review-confirm-team')!.textContent).toContain('되돌리면 요청도 닫혀요')
  })

  it('넣은 뒤 결과 카드에 위키에서 보기(첫 페이지)와 되돌릴 수 있는 기한이 있다', async () => {
    const openFile = vi.fn()
    const container = await mount(null, {
      finalizeReview: async () => ({
        status: 'merged',
        branch: 'app/ingest-1',
        rejected: [],
        teamReview: null,
        shareError: null,
        published: null,
        publishError: null
      })
    })
    useWorkbench.setState({ openFile })
    click(byTestId(container, 'review-finalize')!)
    await act(async () => {
      byTestId(container, 'review-confirm-merge')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })
    expect(byTestId(container, 'review-undo-window')!.textContent).toContain('되돌릴 수 있어요')
    // 성공·실패 한 줄은 색이 아니라 live로 — detail 없는 plain 분기
    expect(byTestId(container, 'review-result')!.getAttribute('role')).toBe('status')
    click(byTestId(container, 'review-open-wiki')!)
    expect(openFile).toHaveBeenCalledWith('wiki/a.md')
  })

  it('넣기에 실패하면 이유를 live로 말한다 — detail 없는 plain 분기', async () => {
    const container = await mount(null, {
      finalizeReview: async () => ({ status: 'failed', reason: 'offline' })
    })
    click(byTestId(container, 'review-finalize')!)
    await act(async () => {
      byTestId(container, 'review-confirm-merge')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })
    const result = byTestId(container, 'review-result')!
    expect(result.textContent).toContain('위키에 넣지 못했어요')
    expect(result.getAttribute('role')).toBe('status')
  })

  const finalizeWith = async (
    extra: Record<string, unknown>,
    api: Record<string, unknown> = {}
  ): Promise<HTMLElement> => {
    const container = await mount(
      {
        url: 'https://github.com/alice/2nd-brain.git',
        webUrl: 'https://github.com/alice/2nd-brain'
      },
      {
        finalizeReview: async () => ({
          status: 'merged',
          branch: 'app/ingest-1',
          rejected: [],
          teamReview: null,
          shareError: null,
          published: null,
          publishError: null,
          ...extra
        }),
        ...api
      }
    )
    click(byTestId(container, 'review-finalize')!)
    await act(async () => {
      byTestId(container, 'review-confirm-merge')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })
    return container
  }

  it('혼자 쓰는 저장소에 올렸으면 GitHub에 올렸다고 하고 GitHub에서 보기를 연다', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined)
    const container = await finalizeWith(
      { published: 'https://github.com/alice/2nd-brain' },
      { openExternal }
    )
    expect(byTestId(container, 'review-published')!.textContent).toContain('되돌릴 수 없어요')
    click(byTestId(container, 'review-published-open')!)
    expect(openExternal).toHaveBeenCalledWith('https://github.com/alice/2nd-brain')
    // 올라간 넣기는 되돌리지 못한다(review-service undoMerge) — 되돌리기를 내밀지 않는다
    expect(byTestId(container, 'review-undo')).toBeNull()
    expect(byTestId(container, 'review-undo-window')).toBeNull()
  })

  it('올리지 못했으면 무엇이 안 됐는지와 다시 올리기 — 다시 올리면 올렸다고 바뀐다', async () => {
    const pushRemote = vi.fn().mockResolvedValue({ ok: true })
    const container = await finalizeWith(
      { publishError: 'GitHub에 연결하지 못했어요' },
      { pushRemote }
    )
    expect(byTestId(container, 'review-publish-error')!.textContent).toContain(
      'GitHub에는 아직 올리지 못했어요'
    )
    await act(async () => {
      byTestId(container, 'review-republish')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })
    expect(pushRemote).toHaveBeenCalled()
    expect(byTestId(container, 'review-published')!.textContent).toContain('GitHub에 올렸어요')
    expect(byTestId(container, 'review-republish')).toBeNull()
    expect(document.activeElement).toBe(byTestId(container, 'review-published-open'))
  })
})
