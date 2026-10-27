// 중앙 문서 자리·탭·이동 기록·편집 가드 — 켜진 탭의 자리(history 포함)가 정본이다.
import type { StateCreator } from 'zustand'
import {
  EMPTY_HISTORY,
  pushEntry,
  stepHistory,
  touchRecent,
  type History,
  type HistoryEntry
} from './history'
import {
  EMPTY_PLACE,
  afterClose,
  emptyTab,
  relocateTab,
  type Tab,
  type TabPlace,
  type WebPlace,
  webTabIds
} from './tabs'
import type { WebState } from '../../../shared/ipc-contract'
import type { ViewId } from './views'
import { startDone } from '../lib/start-done'
import { toUserError } from '../lib/user-error'
import { closedInspector } from './inspector'
import type { WorkbenchState } from './workbench'
import { getT } from '../lib/i18n'

// 리더 스크롤은 스크롤마다 바뀐다 — 구독자를 깨우지 않게 store 밖에 둔다
let readerScrollTop = 0
export const setReaderScrollTop = (top: number): void => {
  readerScrollTop = top
}

export interface DocumentSlice {
  view: ViewId
  /**
   * 사이드바 메뉴 전환 — 기록에 쌓는다(뒤로가 되돌아가기가 되도록).
   * 편집은 묻지 않는다 — 탭은 숨을 뿐이라 쓰던 글이 남는다.
   * 옆 칸은 그대로 둔다(세워 둔 것을 빼앗지 않는다)
   */
  setView: (view: ViewId) => void
  /** 위키 뷰가 여는 페이지 (wiki/ 상대 경로) */
  selectedPage: string | null
  /** 기록 없이 고르기 — 위키 입구 자동 열기 같은 첫 선택에만 쓴다 */
  selectPage: (page: string | null) => void
  /**
   * 빈 문서 자리를 한 번 채웠나 — 앱을 열면 리더가 오늘 노트(없으면 위키 입구)를 스스로 연다.
   * 그 자동 열기는 **첫 화면에만** 걸린다: 빗장이 없으면 사용자가 일부러 연 빈 탭까지
   * 오늘 노트로 채워져 `+` 가 같은 문서를 복사하는 단추가 된다. 보관함을 바꾸면 다시 풀린다
   */
  autoOpened: boolean
  /** 리더가 이 줄로 스크롤 (1-based, 소비 후 null) */
  focusLine: number | null
  /** 리더가 이 위치로 스크롤 (뒤로·앞으로 복원, 소비 후 null) */
  pendingScroll: number | null
  /** 중앙 문서 자리가 무엇을 그리는지 — 리더(md)인가 자료 미리보기인가 */
  docMode: 'page' | 'source'
  /** 미리보기로 여는 파일 — md 가 아닌 파일(그림·PDF·그 밖) */
  selectedSource: string | null
  /** 파일을 고르면 중앙을 미리보기로 바꾼다 */
  selectSource: (rel: string) => void
  /** 트리에서 파일 열기 — md 는 리더로, 그 밖은 미리보기로. `newTab` 이면 새 탭에 */
  openFile: (rel: string, newTab?: boolean) => void
  /** 켜진 탭이 웹 탭이면 그 페이지 — 켜진 탭의 정본은 이 live 필드다(`tabs` 칸은 떠날 때 채운다) */
  web: WebPlace | null
  /** main 이 알린 웹 탭들의 지금 상태 — 탭 id 별. 툴바(불러오는 중·뒤로 가능·실패)가 읽는다 */
  webStates: Record<string, WebState>
  /** 웹 페이지를 연다 — url 이 null 이면 주소칸부터. `newTab` 이면 새 탭에, 아니면 지금 탭을 웹 탭으로 */
  openWeb: (url: string | null, newTab?: boolean) => void
  /** 주소칸에서 이동했다 — 켜진 웹 탭의 주소를 바꾼다(페이지 이동 자체는 main 이 한다) */
  setWebUrl: (url: string) => void
  /** main 이 알린 상태 — 그 탭의 제목·주소를 따라 바꾼다 */
  webStateChanged: (state: WebState) => void
  /**
   * 새 노트를 만들어 열고 이름 칸에 초점을 준다 — 트리의 새 노트 단추와 빈 탭이 같이 쓴다.
   * 실패하면 이유를 돌려준다(부르는 쪽이 자기 자리에 보인다)
   */
  newNote: (folder?: string, name?: string) => Promise<{ rel: string } | { error: string }>
  /**
   * ⌘T "오늘" — 노트가 있으면 그 노트를 연다. 없으면 리더 자리를 비워 빈 탭이 할 일을 세운다.
   * 미리보기(그림·PDF)를 보던 중에도 돌아온다 — 그러지 않으면 누른 것이 아무 일도 안 한 것처럼 보인다
   */
  openToday: (rel: string | null) => void
  /** 지금 중앙에 열린 문서 — 채팅 질문에 싣는다. 중앙이 문서가 아니면 없다 */
  openDocument: () => string | null
  /**
   * 열린 탭들 — 왼쪽부터 화면 순서대로. 늘 한 개 이상이다.
   * **켜진 탭(`tabs[tabAt]`)의 자리·기록은 위의 live 필드(`view`·`selectedPage`·`selectedSource`·
   * `docMode`·`history`)가 정본이다** — 탭 칸의 값은 그 탭을 떠날 때 채워진다.
   * 한 자리를 두 곳에서 갱신하지 않으려는 규칙이라, 탭을 옮길 때만 park/unpark 한다.
   */
  tabs: Tab[]
  tabAt: number
  /** 빈 탭을 끝에 열고 켠다 */
  newTab: () => void
  /** 그 탭으로 옮긴다 — 지금 탭의 자리·기록·스크롤을 접어 두고 저쪽 것을 편다 */
  openTab: (id: string) => void
  /** 그 탭을 닫는다 — 마지막 한 장이면 닫는 대신 빈 탭으로 되돌린다(Obsidian 과 같다) */
  closeTab: (id: string) => void
  history: History
  /** 최근 연 위키 페이지 — Cmd+K 빈 입력 */
  recent: string[]
  /** 위키 뷰에서 페이지 열기 — 기록에 쌓는다 */
  navigate: (page: string, line?: number | null) => void
  back: () => void
  forward: () => void
  /** 편집 중인 페이지. 이동하면 닫힌다 */
  editing: string | null
  setEditing: (rel: string | null) => void
  /** 편집기에 저장 안 한 변경이 있으면 이동 전에 묻는다 */
  editorDirty: boolean
  setEditorDirty: (dirty: boolean) => void
  /** 편집기를 떠나는 동작 — 저장 안 한 변경이 있으면 확인 뒤로 미룬다(취소 버튼 등 navigate 밖의 떠남) */
  leaveEditor: (then: () => void) => void
  pendingNavigation: (() => void) | null
  confirmNavigation: () => void
  cancelNavigation: () => void
  /**
   * 트리·리더에서 이름을 바꾸거나 옮기거나 지웠다 — 열린 문서·최근 목록·옆 칸이 새 자리를 가리키게 한다.
   * 지웠으면 `to` 가 null 이다. 폴더면 그 안의 문서도 같이 옮긴다. 뒤로 기록은 `step` 이 없는 칸을 건너뛴다
   */
  relocated: (from: string, to: string | null) => void
  /** 리더 제목을 고치는 중인 문서 — 새 노트를 만들면 제목부터 쓰게 한다 */
  titleEdit: string | null
  setTitleEdit: (rel: string | null) => void
  /** 막 만든 노트 — 한 글자도 안 쓰고 닫으면 휴지통으로 치운다(이름을 트리에서 받았어도) */
  freshNote: string | null
}

export const createDocumentSlice: StateCreator<WorkbenchState, [], [], DocumentSlice> = (
  set,
  get
) => {
  // 저장 안 한 변경이 있으면 이동을 붙잡아 두고 확인을 기다린다
  const guarded = (move: () => void): void => {
    if (get().editorDirty) set({ pendingNavigation: move })
    else move()
  }

  const readerScrollFor = (view: ViewId, page: string | null, fallback: number): number =>
    view === 'doc' && get().view === 'doc' && get().selectedPage === page
      ? readerScrollTop
      : fallback

  // 켜진 탭이 들고 있어야 할 지금 자리 — 탭을 떠나기 전에 접어 둔다
  const park = (): Tab => {
    const { tabs, tabAt, view, selectedPage, selectedSource, docMode, history, web } = get()
    return {
      ...tabs[tabAt],
      web,
      view,
      page: selectedPage,
      source: selectedSource,
      docMode,
      history,
      scrollTop: readerScrollFor(view, selectedPage, 0)
    }
  }

  /** 접어 둔 것을 지금 탭으로 편다 — 탭 목록을 통째로 갈아 끼우고 `at` 번을 켠다 */
  const unpark = (tabs: Tab[], at: number): void => {
    const tab = tabs[at]
    set({
      tabs,
      tabAt: at,
      view: tab.view,
      web: tab.web,
      selectedPage: tab.page,
      selectedSource: tab.source,
      docMode: tab.docMode,
      history: tab.history,
      pendingScroll: tab.scrollTop,
      focusLine: null,
      // 편집기는 탭 하나에 매여 있다 — 탭을 옮기면 접는다(쓰던 글은 `guarded` 가 먼저 묻는다).
      // 옆 칸은 건드리지 않는다: 근거를 세워 두고 탭을 오가는 것이 이 기능을 쓰는 이유다
      editing: null,
      editorDirty: false
    })
  }

  /** 지금 탭을 접어 두고 끝에 빈 탭을 연다 */
  const blankTab = (): void => {
    const { tabs, tabAt } = get()
    const parked = tabs.map((tab, at) => (at === tabAt ? park() : tab))
    unpark([...parked, emptyTab()], parked.length)
  }

  const step = (delta: -1 | 1): void =>
    guarded(() => {
      const { history, pages } = get()
      const current = history.entries[history.cursor]
      if (!current) return
      const snapshot = {
        ...current,
        scrollTop: readerScrollFor(current.view, current.page, current.scrollTop)
      }
      // 파일 트리의 어느 md 든 wiki 뷰로 열린다 — 위키 목록만 보면 그 칸이 "지워진 페이지" 로
      // 판정돼 기록에서 영구히 빠진다. 트리를 아직 못 읽었으면 지우지 않는다
      const { tree } = get()
      const known = new Set([
        ...(pages ?? []).map((p) => p.rel),
        ...(tree ?? []).filter((e) => e.kind === 'file').map((e) => e.rel)
      ])
      // 지워진 것이 든 칸만 뺀다 — 리더 칸은 그 페이지로, 미리보기 칸은 그 파일로 본다.
      // 한쪽 값으로 둘 다 판정하면 멀쩡한 미리보기가 기록에서 영구히 빠진다
      const exists = (entry: HistoryEntry): boolean => {
        if (entry.view !== 'doc' || tree === null) return true
        const rel = entry.docMode === 'source' ? entry.source : entry.page
        return rel === null || known.has(rel)
      }
      const result = stepHistory(history, delta, snapshot, exists)
      if (!result) return
      const { page, view } = result.entry
      set({
        history: result.history,
        recent: view === 'doc' && page ? touchRecent(get().recent, page) : get().recent,
        view: result.entry.view,
        docMode: result.entry.docMode,
        selectedPage: result.entry.page,
        selectedSource: result.entry.source,
        pendingScroll: result.entry.scrollTop,
        focusLine: null,
        ...closedInspector(get()),
        editing: null,
        editorDirty: false
      })
    })

  // 첫 탭이 무엇을 여는지는 한 곳에서 정한다 — live 필드와 탭 칸이 갈라지면 첫 화면이 두 개가 된다
  const firstPlace: TabPlace = { ...EMPTY_PLACE, view: startDone() ? 'doc' : 'start' }

  return {
    tabs: [emptyTab(firstPlace)],
    tabAt: 0,
    newTab: () => guarded(blankTab),
    openTab: (id) =>
      guarded(() => {
        const { tabs, tabAt } = get()
        const at = tabs.findIndex((tab) => tab.id === id)
        if (at < 0 || at === tabAt) return
        unpark(
          tabs.map((tab, index) => (index === tabAt ? park() : tab)),
          at
        )
      }),
    closeTab: (id) =>
      guarded(() => {
        const { tabs, tabAt } = get()
        const at = tabs.findIndex((tab) => tab.id === id)
        if (at < 0) return
        // 웹 탭이었으면 main 의 view 도 파기하고 그 상태를 잊는다
        if (webTabIds(tabs, tabAt, get().web).includes(id)) {
          void window.api.webClose(id).catch(() => {})
          const webStates = { ...get().webStates }
          delete webStates[id]
          set({ webStates })
        }
        // 마지막 한 장은 닫는 대신 비운다 — 탭이 없는 창은 갈 곳이 없다
        if (tabs.length === 1) {
          unpark([emptyTab()], 0)
          return
        }
        // 뒤에 있는 탭을 닫는 것은 이동이 아니다 — 보고 있던 자리·편집기를 건드리지 않는다
        if (at !== tabAt) {
          set({ tabs: tabs.filter((_, index) => index !== at), tabAt: afterClose(tabs, at, tabAt) })
          return
        }
        unpark(
          tabs.filter((_, index) => index !== at),
          afterClose(tabs, at, tabAt)
        )
      }),
    // 첫 실행은 시작하기로 연다 — 준비 확인을 기다렸다 끌어오면 그 사이 사용자가 누른 곳을 빼앗는다
    // 준비가 끝난 사용자는 문서 자리로 연다(07 이 여기에 오늘 노트를 앉힌다)
    view: firstPlace.view,
    // 메뉴 전환도 기록에 쌓는다 — 검색·그래프에서 뒤로 갔을 때 와 본 적 없는 위키가 뜨면
    // 뒤로는 되돌아가기가 아니라 순간이동이다.
    // 여기서는 편집을 묻지 않는다: 탭은 숨을 뿐 언마운트되지 않아 쓰던 글이 그대로 남는다.
    // 글을 실제로 잃는 자리(보관함 전환·창 닫기·navigate)만 `guarded` 를 탄다
    setView: (view) => {
      const { view: from, selectedPage, selectedSource, docMode, history } = get()
      if (from === view) return
      const here = { page: selectedPage, source: selectedSource, docMode }
      set({
        view,
        // 시작하기를 떠나면 돌아올 길도 버린다 — 첫걸음에서 연 시작하기에 낡은 단추가 남지 않게
        startFrom: view === 'start' ? get().startFrom : null,
        history: pushEntry(
          history,
          { view: from, ...here, scrollTop: readerScrollFor(from, selectedPage, 0) },
          { view, ...here, scrollTop: 0 }
        )
      })
    },
    selectedPage: null,
    selectPage: (selectedPage) => set({ selectedPage, focusLine: null }),
    autoOpened: false,
    focusLine: null,
    pendingScroll: null,
    docMode: 'page',
    newNote: async (folder = '', name) => {
      let result: Awaited<ReturnType<typeof window.api.createVaultNote>>
      try {
        result = await window.api.createVaultNote(folder, name)
      } catch (error) {
        return { error: toUserError(error, getT().files.createNoteFailed).text }
      }
      if ('error' in result) return result
      await get().refreshTree()
      get().openFile(result.rel)
      // 이름부터 쓰게 한다 — "제목 없음" 이 트리에 쌓이지 않게(Obsidian 의 새 노트와 같다).
      // 트리가 인라인 칸에서 이름을 받아 왔으면 다시 묻지 않는다
      set({
        titleEdit: name === undefined ? result.rel : null,
        freshNote: result.rel,
        editing: result.rel,
        editorDirty: false
      })
      return result
    },
    openFile: (rel, inNewTab = false) => {
      const open = (): void => {
        if (rel.toLowerCase().endsWith('.md')) get().navigate(rel)
        else get().selectSource(rel)
      }
      // md 는 navigate 가 쓰던 글을 묻는다. md 가 아니면 여기서 묻는다 — 고치던 글이 있으면 확인창이 먼저 뜬다
      if (!inNewTab) {
        if (rel.toLowerCase().endsWith('.md')) open()
        else get().leaveEditor(open)
        return
      }
      guarded(() => {
        blankTab()
        open()
        // 문서로 바로 연 탭은 그 문서에서 시작한다 — 거쳐 온 빈 자리를 남기면 ← 가 빈 화면으로 간다
        set({ history: { entries: get().history.entries.slice(-1), cursor: 0 } })
      })
    },
    web: null,
    webStates: {},
    openWeb: (url, inNewTab = true) =>
      guarded(() => {
        if (inNewTab) blankTab()
        set({ web: { url, title: '' } })
        get().setView('web')
        // 웹으로 바로 연 탭은 그 페이지에서 시작한다 — 거쳐 온 빈 자리를 남기면 ← 가 빈 화면으로 간다
        if (inNewTab) set({ history: { entries: get().history.entries.slice(-1), cursor: 0 } })
      }),
    setWebUrl: (url) => set({ web: { url, title: get().web?.title ?? '' } }),
    webStateChanged: (state) => {
      const { tabs, tabAt, webStates } = get()
      const at = tabs.findIndex((tab) => tab.id === state.tabId)
      if (at < 0) return
      // 실패한 이동은 주소를 바꾸지 않는다 — 넣은 주소가 주소칸에 남아야 다시 열 수 있다
      const place = (web: WebPlace | null): WebPlace => ({
        url: state.url || web?.url || null,
        title: state.title === state.url ? '' : state.title
      })
      const next = { webStates: { ...webStates, [state.tabId]: state } }
      if (at === tabAt) set({ ...next, web: place(get().web) })
      else
        set({
          ...next,
          tabs: tabs.map((tab, index) => (index === at ? { ...tab, web: place(tab.web) } : tab))
        })
    },
    openToday: (rel) => {
      if (rel !== null) {
        get().navigate(rel)
        return
      }
      // 기록에 쌓이는 이동은 setView 가 한다 — docMode 를 먼저 되돌려 그 칸도 리더로 남긴다
      set({ docMode: 'page' })
      get().setView('doc')
    },
    openDocument: () => {
      const { view, docMode, selectedPage, selectedSource } = get()
      if (view !== 'doc') return null
      return docMode === 'page' ? selectedPage : selectedSource
    },
    selectedSource: null,
    // 미리보기도 중앙 문서 자리를 쓴다 — 뷰 전환과 같은 이동이므로 같은 기록을 탄다
    // (setView 와 같은 이유로 편집은 묻지 않는다 — 편집기는 숨을 뿐 남아 있다)
    selectSource: (selectedSource) => {
      const { view, selectedPage, docMode, history } = get()
      const from = {
        view,
        page: selectedPage,
        source: get().selectedSource,
        docMode,
        scrollTop: readerScrollFor(view, selectedPage, 0)
      }
      set({
        selectedSource,
        docMode: 'source',
        history: pushEntry(history, from, {
          view: 'doc',
          page: selectedPage,
          source: selectedSource,
          docMode: 'source',
          scrollTop: 0
        }),
        view: 'doc'
      })
    },
    relocated: (from, to) => {
      const moved = (rel: string | null): string | null => {
        if (rel === null || (rel !== from && !rel.startsWith(`${from}/`))) return rel
        return to === null ? null : to + rel.slice(from.length)
      }
      const {
        selectedPage,
        selectedSource,
        recent,
        editing,
        titleEdit,
        freshNote,
        split,
        peek,
        changedFor,
        versionPick,
        chatTab
      } = get()
      const peekRel = peek === null ? null : moved(peek.rel)
      const pickRel = versionPick === null ? null : moved(versionPick.rel)
      set({
        chatTab: peekRel === null && chatTab === 'peek' ? (get().peekFrom ?? 'chat') : chatTab,
        // 접어 둔 탭도 같이 옮긴다 — 다시 켰을 때 없는 파일을 가리키지 않게
        tabs: get().tabs.map((tab) => relocateTab(tab, moved)),
        selectedPage: moved(selectedPage),
        selectedSource: moved(selectedSource),
        recent: recent.map(moved).filter((rel): rel is string => rel !== null),
        editing: moved(editing),
        titleEdit: moved(titleEdit),
        freshNote: moved(freshNote),
        split: moved(split),
        peek: peek === null || peekRel === null ? null : { ...peek, rel: peekRel },
        peekFrom: peekRel === null ? null : get().peekFrom,
        versionPick:
          versionPick === null || pickRel === null ? null : { ...versionPick, rel: pickRel },
        changedFor:
          changedFor !== null && moved(changedFor.rel) !== changedFor.rel ? null : changedFor
      })
    },
    titleEdit: null,
    setTitleEdit: (titleEdit) => set({ titleEdit }),
    freshNote: null,

    editing: null,
    setEditing: (editing) => set({ editing, editorDirty: false }),
    editorDirty: false,
    setEditorDirty: (editorDirty) => set({ editorDirty }),
    leaveEditor: (then) => guarded(then),
    pendingNavigation: null,
    confirmNavigation: () => {
      const move = get().pendingNavigation
      set({ pendingNavigation: null, editorDirty: false, editing: null })
      move?.()
    },
    cancelNavigation: () => set({ pendingNavigation: null }),

    history: EMPTY_HISTORY,
    recent: [],
    navigate: (page, line = null) =>
      guarded(() => {
        const { view, selectedPage, selectedSource, docMode, history } = get()
        const from = {
          view,
          page: selectedPage,
          source: selectedSource,
          docMode,
          scrollTop: readerScrollFor(view, selectedPage, 0)
        }
        set({
          history: pushEntry(history, from, {
            view: 'doc',
            page,
            source: selectedSource,
            docMode: 'page',
            scrollTop: 0
          }),
          recent: touchRecent(get().recent, page),
          view: 'doc',
          docMode: 'page',
          selectedPage: page,
          focusLine: line,
          pendingScroll: line === null ? 0 : null,
          ...closedInspector(get()),
          editing: null,
          editorDirty: false
        })
      }),
    back: () => step(-1),
    forward: () => step(1)
  }
}
