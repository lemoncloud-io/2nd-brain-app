// @vitest-environment jsdom
// 고른 버전과 지금 글의 바뀐 줄, 그리고 되돌리기가 편집 저장과 같은 길(지금 글의 해시)로 가는가.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DocVersion } from '../../../../shared/ipc-contract'
import { DIFF_TEXT_LIMIT, HistoryDiff } from './history-diff'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const version: DocVersion = {
  rev: 'a'.repeat(40),
  kind: 'ai',
  author: 'tak',
  date: '2026-10-02T15:04:00+09:00'
}

const api = {
  docAt: vi.fn<(rel: string, rev: string) => Promise<{ text: string } | { error: string }>>(),
  writeWikiPage:
    vi.fn<
      (
        rel: string,
        text: string,
        hash: string
      ) => Promise<{ ok: true; hash: string } | { error: string }>
    >()
}
;(window as unknown as { api: typeof api }).api = api

let root: Root | null = null
let host: HTMLDivElement

beforeEach(() => {
  api.docAt.mockReset()
  api.writeWikiPage.mockReset()
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host.remove()
})

const render = async (current: string, onRestored = vi.fn(), hash = 'h-now'): Promise<void> => {
  root ??= createRoot(host)
  await act(async () => {
    root?.render(
      <HistoryDiff
        rel="wiki/a.md"
        version={version}
        current={current}
        hash={hash}
        onClose={() => undefined}
        onRestored={onRestored}
      />
    )
  })
}

const byTestId = (id: string): HTMLElement | null => host.querySelector(`[data-testid="${id}"]`)

describe('HistoryDiff', () => {
  it('그 버전에만 있던 줄과 지금 글에만 있는 줄을 보이고, 되돌리면 그 버전 글을 지금 해시로 저장한다', async () => {
    api.docAt.mockResolvedValue({ text: '# A\n옛 줄\n' })
    api.writeWikiPage.mockResolvedValue({ ok: true, hash: 'h-new' })
    const onRestored = vi.fn()
    await render('# A\n새 줄\n', onRestored)

    expect(api.docAt).toHaveBeenCalledWith('wiki/a.md', version.rev)
    const hunk = byTestId('history-hunk')
    expect(hunk?.textContent).toContain('예전 글: 옛 줄')
    expect(hunk?.textContent).toContain('지금 글: 새 줄')
    // ± 기호·줄 번호 대신 말로 가른다
    expect(hunk?.textContent).not.toMatch(/[−+]|번째 줄/)

    await act(async () => byTestId('history-restore')?.click())
    expect(api.writeWikiPage).toHaveBeenCalledWith('wiki/a.md', '# A\n옛 줄\n', 'h-now')
    // 실행 취소가 쓸 것 — 되돌리기 전 글과 저장된 글의 해시
    expect(onRestored).toHaveBeenCalledWith({ text: '# A\n새 줄\n', hash: 'h-new' })
  })

  it('저장이 거절되면(보는 사이 바뀜·승인 대기) 그 이유를 보이고 리더로 돌아가지 않는다', async () => {
    api.docAt.mockResolvedValue({ text: '옛\n' })
    api.writeWikiPage.mockResolvedValue({
      error: '편집하는 사이 파일이 바뀌었어요. 다시 연 뒤 편집해 주세요'
    })
    const onRestored = vi.fn()
    await render('새\n', onRestored)

    await act(async () => byTestId('history-restore')?.click())
    expect(byTestId('history-restore-error')?.textContent).toContain('파일이 바뀌었어요')
    expect(onRestored).not.toHaveBeenCalled()
  })

  it('보는 사이 문서가 바뀌면 비교를 바꾸지 않고 되돌리기를 막으며, 다시 견주면 새 글로 비교한다', async () => {
    api.docAt.mockResolvedValue({ text: '옛\n' })
    api.writeWikiPage.mockResolvedValue({ ok: true, hash: 'h' })
    await render('그때 글\n')
    await render('받은 글\n', vi.fn(), 'h-later')
    expect(byTestId('history-hunk')?.textContent).toContain('지금 글: 그때 글')
    expect(byTestId('history-moved')).not.toBeNull()
    expect((byTestId('history-restore') as HTMLButtonElement).disabled).toBe(true)

    await act(async () => byTestId('history-rebase')?.click())
    expect(byTestId('history-moved')).toBeNull()
    expect(byTestId('history-hunk')?.textContent).toContain('지금 글: 받은 글')
    await act(async () => byTestId('history-restore')?.click())
    expect(api.writeWikiPage).toHaveBeenCalledWith('wiki/a.md', '옛\n', 'h-later')
  })

  it('비교 전용(md 아닌 글자 파일)에는 되돌리기 단추가 없고 지금 글을 그대로 따라 견준다', async () => {
    api.docAt.mockResolvedValue({ text: '<p>옛</p>\n' })
    root = createRoot(host)
    const show = async (current: string): Promise<void> => {
      await act(async () => {
        root?.render(
          <HistoryDiff
            rel="outputs/report.html"
            version={version}
            current={current}
            onClose={() => undefined}
          />
        )
      })
    }
    await show('<p>새</p>\n')
    expect(api.docAt).toHaveBeenCalledWith('outputs/report.html', version.rev)
    expect(byTestId('history-hunk')?.textContent).toContain('예전 글: <p>옛</p>')
    expect(byTestId('history-restore')).toBeNull()

    await show('<p>더 새</p>\n')
    expect(byTestId('history-hunk')?.textContent).toContain('지금 글: <p>더 새</p>')
    expect(byTestId('history-moved')).toBeNull()
    expect(api.writeWikiPage).not.toHaveBeenCalled()
  })

  it('비교 전용에서 글이 상한보다 길면 줄 비교 대신 안내 문구를 보인다', async () => {
    api.docAt.mockResolvedValue({ text: 'a\n' })
    root = createRoot(host)
    await act(async () => {
      root?.render(
        <HistoryDiff
          rel="data/rows.csv"
          version={version}
          current={`${'가'.repeat(DIFF_TEXT_LIMIT + 1)}\n`}
          onClose={() => undefined}
        />
      )
    })
    expect(byTestId('history-too-large')?.textContent).toContain('너무 길어서')
    expect(byTestId('history-hunk')).toBeNull()
    expect(byTestId('history-restore')).toBeNull()
  })

  it('md 는 길어도 줄 비교를 보인다 — 못 본 채 되돌리게 두지 않는다', async () => {
    api.docAt.mockResolvedValue({ text: 'a\n' })
    await render(`${'가'.repeat(DIFF_TEXT_LIMIT + 1)}\n`)
    expect(byTestId('history-too-large')).toBeNull()
    expect(byTestId('history-hunk')).not.toBeNull()
    expect(byTestId('history-restore')).not.toBeNull()
  })

  it('지금 글과 같으면 부제 한 줄로만 말하고 되돌리기 단추를 세우지 않는다', async () => {
    api.docAt.mockResolvedValue({ text: '같은 글\n' })
    await render('같은 글\n')
    expect(byTestId('history-same')?.textContent).toBe('지금 글과 같은 버전이에요')
    expect(host.textContent).not.toContain('다른 줄이에요')
    expect(byTestId('history-restore')).toBeNull()
  })

  it('버전을 읽지 못하면 이유를 보이고 되돌리기를 막는다', async () => {
    api.docAt.mockResolvedValue({ error: '이 버전을 찾지 못했어요' })
    await render('글\n')
    expect(byTestId('history-diff-error')?.textContent).toContain('이 버전을 찾지 못했어요')
    expect((byTestId('history-restore') as HTMLButtonElement).disabled).toBe(true)
  })
})
