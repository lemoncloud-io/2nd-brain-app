// @vitest-environment jsdom
// 새 노트 만들기의 계약 — IPC 세 갈래(성공·거절·끊김)가 store를 어디에 두는지. 파일 쓰기 경로라 pin한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkbench } from './workbench'

const api = (): Record<string, ReturnType<typeof vi.fn>> =>
  window.api as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  useWorkbench.setState({
    vaultDir: '/vault',
    tree: [],
    selectedPage: null,
    editing: null,
    editorDirty: false,
    titleEdit: null,
    freshNote: null
  })
  window.api = {
    getVaultStatus: () => Promise.resolve({ vaultDir: '/vault' }),
    listVaultTree: vi.fn(() => Promise.resolve([])),
    createVaultNote: vi.fn(async () => ({ rel: 'wiki/새 노트.md' }))
  } as unknown as typeof window.api
})

describe('newNote', () => {
  it('이름 없이 만들면 트리를 다시 읽고 그 자리에서 제목을 묻는다', async () => {
    const result = await useWorkbench.getState().newNote('wiki')
    expect(result).toEqual({ rel: 'wiki/새 노트.md' })
    expect(api().createVaultNote).toHaveBeenCalledWith('wiki', undefined)
    expect(api().listVaultTree).toHaveBeenCalled()
    const state = useWorkbench.getState()
    // 트리에서 이름을 받아 온 게 아니라 직접 만든 자리 — 인라인 제목 칸을 연다
    expect(state.titleEdit).toBe('wiki/새 노트.md')
    expect(state.freshNote).toBe('wiki/새 노트.md')
    expect(state.editing).toBe('wiki/새 노트.md')
    expect(state.selectedPage).toBe('wiki/새 노트.md')
  })

  it('이름을 받아 왔으면 다시 묻지 않는다 — 트리 인라인 칸이 이미 받았다', async () => {
    const result = await useWorkbench.getState().newNote('wiki', 'wiki/정리.md')
    expect(result).toEqual({ rel: 'wiki/새 노트.md' })
    expect(api().createVaultNote).toHaveBeenCalledWith('wiki', 'wiki/정리.md')
    expect(useWorkbench.getState().titleEdit).toBeNull()
    expect(useWorkbench.getState().editing).toBe('wiki/새 노트.md')
  })

  it('main이 거절하면 그 사유를 돌리고 자리를 옮기지 않는다', async () => {
    api().createVaultNote = vi.fn(async () => ({ error: '막혔어요' }))
    const result = await useWorkbench.getState().newNote('wiki')
    expect(result).toEqual({ error: '막혔어요' })
    // 트리도 안 읽고 문서도 안 연다
    expect(api().listVaultTree).not.toHaveBeenCalled()
    expect(useWorkbench.getState().selectedPage).toBeNull()
    expect(useWorkbench.getState().editing).toBeNull()
  })

  it('IPC가 끊기면 사람이 읽을 문장으로 눕힌다', async () => {
    api().createVaultNote = vi.fn(async () => {
      throw new Error('gone')
    })
    const result = await useWorkbench.getState().newNote('wiki')
    expect(result).toEqual({ error: expect.stringContaining('노트를 만들지 못했어요') })
    expect(useWorkbench.getState().selectedPage).toBeNull()
  })
})

describe('openFile — 코드 고치기 가드', () => {
  it('바뀜이 있으면 md가 아닌 파일로 옮기기 전에 묻는다', () => {
    useWorkbench.setState({ editorDirty: true, pendingNavigation: null })
    useWorkbench.getState().openFile('raw/a.js')
    expect(useWorkbench.getState().pendingNavigation).not.toBeNull()
    useWorkbench.getState().cancelNavigation()
    expect(useWorkbench.getState().pendingNavigation).toBeNull()
  })

  it('바뀜이 없으면 바로 미리보기로 연다', () => {
    useWorkbench.setState({ editorDirty: false, pendingNavigation: null })
    useWorkbench.getState().openFile('raw/a.js')
    expect(useWorkbench.getState().pendingNavigation).toBeNull()
    expect(useWorkbench.getState().selectedSource).toBe('raw/a.js')
  })
})
