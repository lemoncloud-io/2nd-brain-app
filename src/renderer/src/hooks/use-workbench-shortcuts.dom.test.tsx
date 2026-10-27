// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkbench } from '../store/workbench'
import { useWorkbenchShortcuts } from './use-workbench-shortcuts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
const Host = (): null => {
  useWorkbenchShortcuts()
  return null
}
beforeEach(() => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<Host />))
})
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  useWorkbench.setState({
    findFor: null,
    paletteOpen: false,
    pendingNavigation: null,
    editing: null
  })
  vi.restoreAllMocks()
})

const isMac = navigator.userAgent.includes('Mac')
const press = (code: string, target: EventTarget = window, altKey = false): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', {
    code,
    altKey,
    bubbles: true,
    cancelable: true,
    ...(isMac ? { metaKey: true } : { ctrlKey: true })
  })
  act(() => {
    target.dispatchEvent(e)
  })
  return e
}

describe('Mod+F — test: use-workbench-shortcuts.ts', () => {
  it('리더에서 누르면 지금 페이지의 찾기 띠를 연다', () => {
    useWorkbench.setState({ view: 'doc', selectedPage: 'wiki/a.md' })
    const e = press('KeyF')
    expect(useWorkbench.getState().findFor).toBe('wiki/a.md')
    expect(e.defaultPrevented).toBe(true)
  })

  it('편집기 안(.cm-editor)·팔레트·편집 중(초점이 밖이어도)·페이지 없음 — 양보한다', () => {
    useWorkbench.setState({ view: 'doc', selectedPage: 'wiki/a.md' })
    const editor = document.createElement('div')
    editor.className = 'cm-editor'
    const inside = document.createElement('div')
    editor.appendChild(inside)
    document.body.appendChild(editor)
    expect(press('KeyF', inside).defaultPrevented).toBe(false)
    useWorkbench.setState({ paletteOpen: true })
    expect(press('KeyF').defaultPrevented).toBe(false)
    useWorkbench.setState({ paletteOpen: false, editing: 'wiki/a.md' })
    expect(press('KeyF').defaultPrevented).toBe(false)
    useWorkbench.setState({ editing: null, selectedPage: null })
    expect(press('KeyF').defaultPrevented).toBe(false)
    expect(useWorkbench.getState().findFor).toBeNull()
  })
})

describe('명령 표 경유 — test: commands.ts', () => {
  it('⌘P 는 팔레트를 명령 모드(`>`)로 여닫고, 떠 있는 동안 다른 단축키는 막힌다', () => {
    useWorkbench.setState({ view: 'doc', selectedPage: 'wiki/a.md' })
    press('KeyP')
    expect(useWorkbench.getState().paletteOpen).toBe(true)
    expect(useWorkbench.getState().paletteSeed).toBe('>')
    expect(press('KeyF').defaultPrevented).toBe(false)
    expect(useWorkbench.getState().findFor).toBeNull()
    press('KeyP')
    expect(useWorkbench.getState().paletteOpen).toBe(false)
  })

  it('⌘K 는 팔레트를 문서 모드로 토글, ⌥⌘T 새 탭 — 표의 정의대로', () => {
    press('KeyK')
    expect(useWorkbench.getState().paletteOpen).toBe(true)
    expect(useWorkbench.getState().paletteSeed).toBe('')
    // 문서 팔레트가 떠 있으면 새 탭은 양보한다
    expect(press('KeyT', window, true).defaultPrevented).toBe(false)
    press('KeyK')
    const before = useWorkbench.getState().tabs.length
    press('KeyT', window, true)
    expect(useWorkbench.getState().tabs.length).toBe(before + 1)
  })

  it('양보 조건 — 편집기·contentEditable 에선 ⌘T·⌘J·⌘\\ 가, 채팅 입력칸에선 ⌘[ ⌘] 도 글자 편집에 양보한다', () => {
    useWorkbench.setState({ view: 'doc', selectedPage: 'wiki/a.md' })
    const editor = document.createElement('div')
    editor.className = 'cm-editor'
    const inside = document.createElement('div')
    editor.appendChild(inside)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    const textarea = document.createElement('textarea')
    const input = document.createElement('input')
    document.body.append(editor, editable, textarea, input)
    for (const target of [inside, editable]) {
      for (const code of ['KeyT', 'KeyJ', 'Backslash', 'BracketLeft']) {
        expect(press(code, target).defaultPrevented, `${code} in editor`).toBe(false)
      }
    }
    expect(press('BracketLeft', textarea).defaultPrevented).toBe(false)
    expect(press('BracketRight', textarea).defaultPrevented).toBe(false)
    // 일반 입력칸은 막지 않는다 — 검색 입력칸에서 ⌘J 로 채팅에 오는 길
    expect(press('KeyJ', input).defaultPrevented).toBe(true)
    expect(press('BracketLeft', input).defaultPrevented).toBe(true)
  })

  it('⌘K 로 연 팔레트는 ⌘P 로도 닫힌다 — 같은 창이다', () => {
    press('KeyK')
    expect(press('KeyP').defaultPrevented).toBe(true)
    expect(useWorkbench.getState().paletteOpen).toBe(false)
  })

  it('⌘N 은 빈 탭을 연다 — 파일을 만들지 않는다', async () => {
    const createVaultNote = vi.fn(async () => ({ rel: 'wiki/새 노트.md' }))
    window.api = {
      createVaultNote,
      listVaultTree: vi.fn(async () => []),
      getVaultStatus: vi.fn(async () => ({ vaultDir: '/vault' }))
    } as unknown as typeof window.api
    useWorkbench.setState({ view: 'doc', tree: [{ rel: 'wiki/a.md' }] as never })
    const tabsBefore = useWorkbench.getState().tabs.length
    press('KeyN')
    await vi.waitFor(() => expect(useWorkbench.getState().tabs.length).toBe(tabsBefore + 1))
    expect(createVaultNote).not.toHaveBeenCalled()
  })

  it('⌘1–9 는 표에 있고 막히지 않는다 — 번호→탭 매핑은 표 단위에서 잰다', () => {
    useWorkbench.setState({ view: 'doc' })
    expect(press('Digit1').defaultPrevented).toBe(true)
    expect(press('Digit9').defaultPrevented).toBe(true)
  })
})
