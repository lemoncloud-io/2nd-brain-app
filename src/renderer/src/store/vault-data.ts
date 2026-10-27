// 볼트 데이터 — IPC 로 읽는 목록들. 실패해도 보조 표기는 빈 값으로 둔다.
import type { StateCreator } from 'zustand'
import type { VaultDocEntry, VaultTreeEntry, WikiListEntry } from '../../../shared/ipc-contract'
import { DEFAULT_UI_PREFS, type UiPrefs } from '../../../shared/ui-prefs'
import type { VaultChangeMap } from '../../../shared/vault-changes'
import { toUserError } from '../lib/user-error'
import { EMPTY_PLACE, emptyTab, webTabIds } from './tabs'
import { EMPTY_HISTORY } from './history'
import { closedInspector } from './inspector'
import type { WorkbenchState } from './workbench'
import { getT } from '../lib/i18n'

export type SidebarPane = 'files' | 'tags' | 'bookmarks'

/** 보관함 토큰 — IPC 를 오가는 사이 바뀌었는지 견준다 */
const vaultToken = async (): Promise<string | null> => {
  try {
    return (await window.api.getVaultStatus()).vaultDir
  } catch {
    return null
  }
}

/**
 * 읽는 전후로 보관함을 견준다. 바뀌었으면 옛 보관함 것이라 버리고 null.
 * throw 는 그대로 던진다 — 호출부의 catch 가 기존 규칙대로 눕힌다.
 * 새로 바뀐 쪽의 읽기가 덮는다(신호마다 전부 다시 읽는다)
 */
const guardVault = async <T>(read: () => Promise<T>): Promise<{ data: T } | null> => {
  const before = await vaultToken()
  const data = await read()
  const after = await vaultToken()
  return before === after ? { data } : null
}

export interface VaultDataSlice {
  /** 볼트 wiki/ 페이지 — 트리·Cmd+K·기록 검사가 같이 쓴다. 볼트 없음·오류면 null */
  pages: WikiListEntry[] | null
  pagesError: string | null
  /** 보관함 문서 제목 — Cmd+K 가 읽는다. 위키 목록(`pages`)과 달리 `wiki/` 밖까지 담는다 */
  docs: VaultDocEntry[] | null
  docsError: string | null
  /** 파일 트리 — 보관함의 모든 폴더·파일(평면) */
  tree: VaultTreeEntry[] | null
  treeError: string | null
  vaultDir: string | null
  refreshPages: () => Promise<void>
  refreshDocs: () => Promise<void>
  refreshTree: () => Promise<void>
  /**
   * 보관함에서 달라진 파일 — 트리 배지가 읽는다. 트리와 같은 신호(`wikiChanged`)에 함께 새로 읽는다.
   * 읽기 실패는 빈 맵이다: 배지는 보조 표기라 화면에 오류를 세우지 않는다
   */
  changes: VaultChangeMap
  refreshChanges: () => Promise<void>
  /** 사이드바 위 칸 — 파일 트리·태그·북마크(Obsidian 왼쪽 칸의 탭) */
  sidebarPane: SidebarPane
  setSidebarPane: (pane: SidebarPane) => void
  /** 북마크한 문서 — `.obsidian/bookmarks.json`. 트리와 같은 신호에 다시 읽는다 */
  bookmarks: string[]
  refreshBookmarks: () => Promise<void>
  /** 달거나 뗀다 — 실패하면 사유 */
  toggleBookmark: (rel: string) => Promise<string | null>
  /**
   * 고급 표시 — 트리의 확장자와 채팅 지표. 화면 여러 곳이 같은 값을 봐야 해서 여기 둔다.
   * 못 읽으면 기본값(둘 다 꺼짐) 그대로다 — 보조 표기라 읽기 실패를 화면에 세우지 않는다
   */
  uiPrefs: UiPrefs
  loadUiPrefs: () => Promise<void>
  /** 설정 화면이 부른다 — 정규화해 저장된 값을 그대로 담는다 */
  saveUiPrefs: (prefs: UiPrefs) => Promise<UiPrefs>
}

export const createVaultDataSlice: StateCreator<WorkbenchState, [], [], VaultDataSlice> = (
  set,
  get
) => ({
  pages: null,
  pagesError: null,
  docs: null,
  docsError: null,
  tree: null,
  treeError: null,
  changes: {},
  refreshChanges: async () => {
    try {
      const guarded = await guardVault(() => window.api.getVaultChanges())
      if (guarded === null) return
      set({ changes: guarded.data })
    } catch {
      set({ changes: {} })
    }
  },
  uiPrefs: DEFAULT_UI_PREFS,
  loadUiPrefs: async () => {
    try {
      set({ uiPrefs: await window.api.getUiPrefs() })
    } catch {
      // 기본값으로 둔다 — 설정 화면에서 다시 켤 수 있다
    }
  },
  saveUiPrefs: async (prefs) => {
    const saved = await window.api.setUiPrefs(prefs)
    set({ uiPrefs: saved })
    return saved
  },
  sidebarPane: 'files',
  setSidebarPane: (sidebarPane) => set({ sidebarPane }),
  bookmarks: [],
  refreshBookmarks: async () => {
    try {
      const guarded = await guardVault(() => window.api.listBookmarks())
      if (guarded === null) return
      set({ bookmarks: guarded.data })
    } catch {
      // 북마크는 보조 목록이다 — 못 읽으면 빈 채로 둔다
      set({ bookmarks: [] })
    }
  },
  toggleBookmark: async (rel) => {
    try {
      const result = await window.api.toggleBookmark(rel)
      if ('error' in result) return result.error
      set({ bookmarks: result.bookmarks })
      return null
    } catch (error) {
      return toUserError(error, getT().files.bookmarkFailed).text
    }
  },
  refreshTree: async () => {
    let result: Awaited<ReturnType<typeof window.api.listVaultTree>>
    try {
      const guarded = await guardVault(() => window.api.listVaultTree())
      if (guarded === null) return
      result = guarded.data
    } catch (error) {
      set({ tree: null, treeError: toUserError(error, getT().files.treeFailed).text })
      return
    }
    set(
      'error' in result
        ? { tree: null, treeError: result.error }
        : { tree: result, treeError: null }
    )
  },
  refreshDocs: async () => {
    let result: Awaited<ReturnType<typeof window.api.listVaultDocs>>
    try {
      const guarded = await guardVault(() => window.api.listVaultDocs())
      if (guarded === null) return
      result = guarded.data
    } catch (error) {
      set({ docs: null, docsError: toUserError(error, getT().files.docsFailed).text })
      return
    }
    set(
      'error' in result
        ? { docs: null, docsError: result.error }
        : { docs: result, docsError: null }
    )
  },
  vaultDir: null,
  refreshPages: async () => {
    let result: Awaited<ReturnType<typeof window.api.listWikiPages>>
    let status: Awaited<ReturnType<typeof window.api.getVaultStatus>>
    try {
      ;[result, status] = await Promise.all([
        window.api.listWikiPages(),
        window.api.getVaultStatus()
      ])
    } catch (error) {
      // 호출부는 전부 void 다 — 여기서 삼키면 트리·Cmd+K·승인 제목이 조용히 "없다" 가 된다
      set({
        pages: null,
        pagesError: toUserError(error, getT().files.pagesFailed).text
      })
      return
    }
    const previousVault = get().vaultDir
    // 읽는 사이 또 바뀌었으면 버린다 — 느린 옛 읽기가 새 보관함을 덮지 않게(새 쪽 읽기가 덮는다)
    if ((await vaultToken()) !== status.vaultDir) return
    // 볼트가 바뀌면 이전 볼트의 기록·시트·선택은 가리킬 곳이 없다
    if (previousVault !== null && status.vaultDir !== previousVault) {
      // 열린 탭은 전부 이전 볼트의 파일을 가리킨다 — 한 장으로 접고 비운다.
      // 보던 뷰는 그대로 둔다(설정에서 볼트를 바꾸고 설정 밖으로 튕기지 않는다).
      // 옆 칸·오른쪽 칸·찾기·되돌리기도 이전 볼트를 가리킨다 — 같이 비운다.
      // 웹 탭도 접히므로 main 의 웹 view 를 파기한다 — 남기면 탭 없이 숨은 채 페이지가 계속 돈다
      for (const id of webTabIds(get().tabs, get().tabAt, get().web))
        void window.api.webClose(id).catch(() => {})
      set({
        web: null,
        webStates: {},
        tabs: [emptyTab({ ...EMPTY_PLACE, view: get().view })],
        tabAt: 0,
        autoOpened: false,
        history: EMPTY_HISTORY,
        recent: [],
        ...closedInspector(get()),
        chatTab: 'chat',
        selectedPage: null,
        selectedSource: null,
        docMode: 'page',
        editing: null,
        titleEdit: null,
        freshNote: null,
        split: null,
        versionPick: null,
        changedFor: null,
        findFor: null,
        searchRequest: null
      })
    }
    set(
      'error' in result
        ? { pages: null, pagesError: result.error, vaultDir: status.vaultDir }
        : { pages: result, pagesError: null, vaultDir: status.vaultDir }
    )
  }
})
