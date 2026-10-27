// 옆 칸(채팅·근거·기록·분할)과 변경 카드 — 중앙 이동은 document 슬라이스가 맡는다.
import type { StateCreator } from 'zustand'
import type { ChangeSince, DocVersion } from '../../../shared/ipc-contract'
import type { WorkbenchState } from './workbench'

/** 근거 — `cited` 는 답이 줄 없이 페이지 전체를 근거로 댔다는 표시(옆 칸 위에 한 줄로 알린다) */
export type Peek = { rel: string; line: number | null; cited?: boolean }

/**
 * 옆 칸의 세입자 — 문서를 보면서 곁에 두는 것들.
 * 탭을 옮겨도 마운트는 유지한다(진행 중인 위키화의 구독, 대화 스크롤).
 */
export type ChatTab = 'chat' | 'peek' | 'ingest' | 'history'
/** 기록 탭에서 고른 버전 — 가운데에 바뀐 줄을 보인다. 목록은 지금 가운데 문서를 따라가므로 store 는 이것만 든다 */
export type VersionPick = { rel: string; version: DocVersion }
/** 옆 칸을 옮기기 전 자리 — 닫으면 거기로 돌아간다 */
type TabReturn = { tab: ChatTab; open: boolean }

export interface SidecarSlice {
  /** 채팅 입력칸에 초점을 달라는 신호 — 값이 바뀔 때마다 입력칸이 초점을 가져간다 */
  chatFocusAt: number
  /** 밖에서 옆 칸 탭을 열 때 울리는 신호 — 칸 안 탭 이동은 조용하다. 패널 제목이 받아 초점을 옮긴다 */
  sidecarFocusAt: number
  /** 옆 칸이 열려 있다 — 기본은 열림. 하루 루프의 일은 이 칸에 시킨다(DESIGN.md § 하루는 오늘 노트에서 돈다) */
  chatOpen: boolean
  chatTab: ChatTab
  /** 옆 칸을 그 탭으로 연다. `focus` 는 밖에서 연 것만 — 탭 줄 이동은 조용하다 */
  openChat: (tab: ChatTab, opts?: { focus?: boolean }) => void
  /** 옆 칸 여닫기 — 닫았다 열면 보던 탭으로 돌아온다 */
  toggleChat: () => void
  /** ⌘J — 옆 칸을 열고 채팅 탭의 입력칸에 초점을 준다 */
  askChat: () => void
  /** 위키화 시작 요청 — 옆 칸의 위키화 탭을 열고, 번호가 바뀌면 시작한다(시작하기 체크리스트) */
  ingestRequest: number
  requestIngest: () => void
  /** 채팅이 만든 파일을 중앙에 연다 — 편집 중이면 쓰던 글을 가리지 않게 열지 않고 false */
  showChangedFile: (rel: string) => boolean
  /** 리더가 보이는 "바뀐 곳" — 그 문서에만 걸린다(다른 문서로 넘어가면 표시하지 않는다) */
  changedFor: { rel: string; since: ChangeSince; changeId: string | null } | null
  /** 리더 헤더 토글 — 지금 열린 문서의 기준을 바꾼다 */
  setChangedSince: (since: ChangeSince | null) => void
  /** 변경 카드의 "바뀐 곳" — 그 파일을 열고 이번 답 기준으로 켠다 */
  showChanges: (rel: string, changeId: string) => void
  /** 좌우 분할 — 문서 자리 오른쪽에 띄운 문서. 가운데와 따로 움직인다 */
  split: string | null
  openSplit: (rel: string) => void
  closeSplit: () => void
  /** 근거 — 중앙 문서를 두고 옆 칸에서 읽는다 */
  peek: Peek | null
  openPeek: (rel: string, line?: number | null, cited?: boolean) => void
  /** 근거를 열기 전 탭 — 닫거나 "← 채팅으로" 를 누르면 거기로 돌아간다 */
  peekFrom: ChatTab | null
  closePeek: () => void
  /** 리더 머리 기록 단추 — 옆 칸 기록 탭을 열고, 다시 누르면 열기 전 자리로 돌아간다 */
  historyFrom: TabReturn | null
  toggleHistory: () => void
  versionPick: VersionPick | null
  pickVersion: (pick: VersionPick | null) => void
}

export const createSidecarSlice: StateCreator<WorkbenchState, [], [], SidecarSlice> = (
  set,
  get
) => ({
  // 채팅 칸은 기본으로 열려 있다 — 하루가 여기서 시작한다
  chatOpen: true,
  chatTab: 'chat',
  // 탭을 직접 고르면 기록 단추가 돌아갈 자리는 낡는다 — 다음 기록 단추가 지금 자리를 새로 잰다
  openChat: (chatTab, opts) =>
    set({
      chatOpen: true,
      chatTab,
      historyFrom: null,
      ...(opts?.focus === true ? { sidecarFocusAt: Date.now() } : null)
    }),
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
  askChat: () => set({ chatOpen: true, chatTab: 'chat', chatFocusAt: Date.now() }),
  chatFocusAt: 0,
  sidecarFocusAt: 0,
  ingestRequest: 0,
  requestIngest: () =>
    set((s) => ({
      chatOpen: true,
      chatTab: 'ingest',
      ingestRequest: s.ingestRequest + 1,
      sidecarFocusAt: Date.now()
    })),
  changedFor: null,
  setChangedSince: (since) => {
    const { selectedPage, changedFor } = get()
    if (selectedPage === null) return
    set({
      changedFor:
        since === null
          ? null
          : {
              rel: selectedPage,
              since,
              changeId: changedFor?.rel === selectedPage ? changedFor.changeId : null
            }
    })
  },
  showChanges: (rel, changeId) => {
    // 쓰던 글이 있으면 openFile 이 이동을 붙잡아 둔다 — 열지도 않은 문서에 기준을 걸어 두지 않는다
    if (get().editorDirty) {
      get().openFile(rel)
      return
    }
    get().openFile(rel)
    set({ changedFor: { rel, since: { change: changeId }, changeId } })
  },
  showChangedFile: (rel) => {
    const { editing, editorDirty } = get()
    if (editing !== null || editorDirty) return false
    get().openFile(rel)
    return true
  },

  split: null,
  // 분할은 문서 자리의 일이다 — 다른 곳(지식 관리·설정)에 있었으면 문서 자리로 온다
  openSplit: (rel) => set({ split: rel, view: 'doc' }),
  closeSplit: () => set({ split: null }),

  peek: null,
  // 근거는 문서를 덮는 시트가 아니라 옆 칸에 뜬다 — 중앙이 좁아질 뿐 가려지지 않는다
  // 근거 안의 링크로 옮겨 가도 처음 연 자리를 그대로 둔다
  openPeek: (rel, line = null, cited = false) =>
    set((s) => ({
      peek: cited ? { rel, line, cited } : { rel, line },
      peekFrom: s.chatOpen && s.chatTab === 'peek' ? s.peekFrom : backTab(s),
      chatOpen: true,
      chatTab: 'peek',
      sidecarFocusAt: Date.now()
    })),
  peekFrom: null,
  closePeek: () =>
    set((s) => ({
      peek: null,
      peekFrom: null,
      chatTab: s.chatTab === 'peek' ? (s.peekFrom ?? 'chat') : s.chatTab
    })),

  historyFrom: null,
  toggleHistory: () =>
    set((s) => {
      if (s.chatOpen && s.chatTab === 'history') {
        const back = s.historyFrom ?? { tab: 'chat', open: true }
        return {
          chatOpen: back.open,
          chatTab: back.tab === 'peek' && s.peek === null ? 'chat' : back.tab,
          historyFrom: null
        }
      }
      return {
        historyFrom: { tab: s.chatTab === 'history' ? 'chat' : s.chatTab, open: s.chatOpen },
        chatOpen: true,
        chatTab: 'history',
        sidecarFocusAt: Date.now()
      }
    }),
  versionPick: null,
  pickVersion: (versionPick) => set({ versionPick })
})

/** 돌아갈 탭 — 옆 칸이 닫혀 있었으면 보이던 것이 없으니 채팅으로 */
const backTab = (s: SidecarSlice): ChatTab => (s.chatOpen ? s.chatTab : 'chat')
