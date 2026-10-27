// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditorView } from 'codemirror'
import type { DocVersion } from '../../../shared/ipc-contract'
import { useWorkbench } from '../store/workbench'
import { sha256Hex } from '../lib/sha256'
import { SourcePreview } from './source-preview'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom 에는 스크롤이 없다 — 미리보기의 맨 위로 당기기는 빈 손으로 둔다
Element.prototype.scrollTo = () => {}
// jsdom 의 Range 에는 배치 정보가 없다 — CodeMirror 의 재기(선택 표시층)가 다음 프레임에 이걸 부르다 던지면,
// 그 프레임이 act 안에 걸린 테스트는 act 가 끝나지 않아 뒤 테스트까지 엉킨다(전체 실행에서 가끔 재현)
Range.prototype.getClientRects = () => [] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect()

// 저장이 보내는 기준 해시 — 진짜 crypto.subtle 은 libuv 스레드 풀에서 돌아 전체 실행의 다른 파일 입출력 뒤에
// 몇 초씩 밀린다(2026-10-23 실측: 5초 넘게 "저장 중…"). 여기서 보는 것은 읽은 글의 해시가 가는지다
vi.mock('../lib/sha256', () => ({ sha256Hex: (text: string) => Promise.resolve(`hash:${text}`) }))

const roots: Root[] = []
const api = {
  docAt: vi.fn<(rel: string, rev: string) => Promise<{ text: string } | { error: string }>>(),
  writeTextFile:
    vi.fn<
      (
        rel: string,
        text: string,
        baseHash: string
      ) => Promise<{ ok: true; hash: string } | { error: string }>
    >(),
  getAppInfo: () => Promise.resolve({ platform: 'darwin' }),
  revealInFinder: vi.fn(() => Promise.resolve())
}
;(window as unknown as { api: typeof api }).api = api

const version: DocVersion = {
  rev: 'a'.repeat(40),
  kind: 'ai',
  author: 'tak',
  date: '2026-10-02T15:04:00+09:00'
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  api.docAt.mockReset()
  api.writeTextFile.mockReset()
  useWorkbench.setState({ versionPick: null, chatOpen: true, chatTab: 'chat', historyFrom: null })
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const mount = async (rel: string): Promise<HTMLDivElement> => {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response('SELECT 1')))
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(<SourcePreview rel={rel} />))
  return container
}

describe('SourcePreview 코드 미리보기 — test: source-preview code', () => {
  it('.sql 파일은 구문 색 미리보기로 읽힌다', async () => {
    const container = await mount('queries/list.sql')
    const body = container.querySelector('[data-testid="sources-code"]')
    expect(body?.textContent).toContain('SELECT 1')
  })

  it('.js 파일은 구문 색 미리보기로 열린다', async () => {
    const container = await mount('apps/app.js')
    expect(container.querySelector('[data-testid="sources-code"]')).not.toBeNull()
  })

  it('여러 코드 확장자는 구문 색으로, 모르는 확장자는 글자로 읽힌다', async () => {
    for (const rel of ['a.py', 'b.ts', 'c.css', 'd.xml', 'e.cpp']) {
      const container = await mount(rel)
      expect(container.querySelector('[data-testid="sources-code"]')).not.toBeNull()
    }
    for (const rel of ['f.go', 'g.txt']) {
      const container = await mount(rel)
      expect(container.querySelector('[data-testid="sources-txt"]')).not.toBeNull()
    }
  })
})

describe('SourcePreview 머리글', () => {
  it('머리에 Finder에서 보기 단추가 있다 — 그림·글 가리지 않는다', async () => {
    for (const rel of ['attachments/a.png', 'notes/memo.txt']) {
      const container = await mount(rel)
      const button = container.querySelector('[data-testid="source-reveal"]')
      expect(button?.getAttribute('aria-label')).toBe('Finder에서 보기')
    }
  })

  it('누르면 그 파일을 보여 달라고 한다', async () => {
    const container = await mount('attachments/a.png')
    act(() => container.querySelector<HTMLElement>('[data-testid="source-reveal"]')?.click())
    expect(api.revealInFinder).toHaveBeenCalledWith('attachments/a.png')
  })
})

describe('SourcePreview 기록', () => {
  it('html 미리보기 머리의 기록 단추가 옆 칸 기록을 연다', async () => {
    const container = await mount('outputs/report.html')
    const button = container.querySelector<HTMLElement>('[data-testid="source-history"]')
    expect(button?.getAttribute('aria-label')).toBe(
      '이 파일의 기록 — 옆 칸에서 누가 언제 고쳤는지 봐요'
    )
    expect(button?.getAttribute('title')).toBeNull()
    expect(button?.getAttribute('aria-pressed')).toBe('false')
    act(() => button?.click())
    expect(useWorkbench.getState()).toMatchObject({ chatOpen: true, chatTab: 'history' })
    expect(button?.getAttribute('aria-pressed')).toBe('true')
  })

  it('그림 미리보기에는 기록 단추가 없다', async () => {
    const container = await mount('attachments/a.png')
    expect(container.querySelector('[data-testid="source-history"]')).toBeNull()
  })

  it('그림의 대체 글은 파일 이름이다 — 보관함 경로가 아니다', async () => {
    const container = await mount('attachments/a.png')
    expect(container.querySelector('[data-testid="sources-image"]')?.getAttribute('alt')).toBe(
      'a.png'
    )
  })

  it('글 미리보기는 읽는 땅임을 말한다', async () => {
    const container = await mount('notes/memo.txt')
    const body = container.querySelector('[data-testid="sources-txt"]')
    expect(body?.getAttribute('aria-label')).toContain('memo.txt')
  })

  it('버전을 고르면 미리보기 자리에 줄 비교가 뜨고 되돌리기 단추는 없다 — 닫으면 미리보기로 돌아온다', async () => {
    api.docAt.mockResolvedValue({ text: 'SELECT 0' })
    const container = await mount('notes/memo.txt')
    await act(async () => useWorkbench.getState().pickVersion({ rel: 'notes/memo.txt', version }))
    expect(api.docAt).toHaveBeenCalledWith('notes/memo.txt', version.rev)
    expect(container.querySelector('[data-testid="history-hunk"]')?.textContent).toContain(
      '지금 글: SELECT 1'
    )
    expect(container.querySelector('[data-testid="history-restore"]')).toBeNull()
    expect(container.querySelector('[data-testid="sources-txt"]')).toBeNull()

    await act(async () =>
      container.querySelector<HTMLElement>('[data-testid="history-close"]')?.click()
    )
    expect(useWorkbench.getState().versionPick).toBeNull()
    expect(container.querySelector('[data-testid="sources-txt"]')).not.toBeNull()
  })

  it('줄 비교에 들어가면 무엇과 견주는지 말하고 그 제목에 초점이 간다', async () => {
    api.docAt.mockResolvedValue({ text: 'SELECT 0' })
    const container = await mount('notes/memo.txt')
    await act(async () => useWorkbench.getState().pickVersion({ rel: 'notes/memo.txt', version }))
    const title = container.querySelector<HTMLElement>('[data-testid="source-compare-title"]')
    expect(title?.textContent).toContain('버전 비교 중')
    expect(document.activeElement).toBe(title)
  })

  it('다른 파일을 고른 버전은 내려놓는다', async () => {
    useWorkbench.setState({ versionPick: { rel: 'wiki/a.md', version } })
    await mount('apps/app.js')
    expect(useWorkbench.getState().versionPick).toBeNull()
  })
})

describe('SourcePreview 코드 고치기 — test: source edit', () => {
  const press = (container: HTMLDivElement, testId: string): void => {
    act(() => container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.click())
  }
  // 읽기(fetch)가 끝나 편집 칸이 설 때까지 — 고치기 단추 뒤에는 항상 둔다
  const openEditor = async (container: HTMLDivElement): Promise<void> => {
    press(container, 'source-edit')
    await act(async () => {})
  }
  const editView = (container: HTMLDivElement): EditorView | null => {
    const content = container.querySelector('[data-testid="sources-code-editor"] .cm-content')
    return content ? EditorView.findFromDOM(content as HTMLElement) : null
  }
  const type = (container: HTMLDivElement, insert: string): void => {
    act(() => {
      editView(container)?.dispatch({
        changes: { from: editView(container)?.state.doc.length ?? 0, insert }
      })
    })
  }

  it('고치기 단추는 글·코드에만 있다 — 그림·json에는 없다', async () => {
    for (const rel of ['apps/app.js', 'notes/memo.txt']) {
      const container = await mount(rel)
      expect(container.querySelector('[data-testid="source-edit"]')).not.toBeNull()
    }
    for (const rel of ['attachments/a.png', 'raw/data/a.json']) {
      const container = await mount(rel)
      expect(container.querySelector('[data-testid="source-edit"]')).toBeNull()
    }
  })

  it('고치고 저장하면 writeTextFile 로 가고 저장했어요가 뜬다', async () => {
    api.writeTextFile.mockResolvedValue({ ok: true, hash: 'h' })
    const container = await mount('apps/app.js')
    await openEditor(container)
    expect(container.querySelector('[data-testid="sources-code-editor"]')).not.toBeNull()
    // 손대기 전 저장 단추는 잠긴다
    expect(
      container.querySelector<HTMLButtonElement>('[data-testid="source-save"]')?.disabled
    ).toBe(true)
    type(container, '\n// 고침')
    expect(container.querySelector('[data-testid="source-dirty"]')).not.toBeNull()
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="source-save"]')?.click()
    })
    await act(() =>
      vi.waitFor(() =>
        expect(container.querySelector('[data-testid="source-saved"]')).not.toBeNull()
      )
    )
    expect(api.writeTextFile).toHaveBeenCalledWith(
      'apps/app.js',
      'SELECT 1\n// 고침',
      await sha256Hex('SELECT 1')
    )
    expect(container.querySelector('[data-testid="source-saved"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="sources-code-editor"]')).toBeNull()
  })

  it('저장에 실패하면 이유가 보이고 편집 칸은 그대로다', async () => {
    api.writeTextFile.mockResolvedValue({ error: '편집하는 사이 파일이 바뀌었어요' })
    const container = await mount('apps/app.js')
    await openEditor(container)
    type(container, '\n// 고침')
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="source-save"]')?.click()
    })
    await act(() =>
      vi.waitFor(() => expect(container.textContent).toContain('편집하는 사이 파일이 바뀌었어요'))
    )
    expect(container.querySelector('[data-testid="sources-code-editor"]')).not.toBeNull()
  })

  it('바뀜이 있으면 취소는 두 번 눌러 버린다', async () => {
    const container = await mount('apps/app.js')
    await openEditor(container)
    press(container, 'source-cancel')
    // 바뀜 없음 — 한 번에 닫힌다
    expect(container.querySelector('[data-testid="sources-code-editor"]')).toBeNull()
    await openEditor(container)
    type(container, '\n// 고침')
    press(container, 'source-cancel')
    expect(container.querySelector('[data-testid="source-cancel"]')?.textContent).toContain(
      '정말 버리기'
    )
    expect(container.querySelector('[data-testid="sources-code-editor"]')).not.toBeNull()
    press(container, 'source-cancel')
    expect(container.querySelector('[data-testid="sources-code-editor"]')).toBeNull()
    expect(useWorkbench.getState().editorDirty).toBe(false)
  })
})
