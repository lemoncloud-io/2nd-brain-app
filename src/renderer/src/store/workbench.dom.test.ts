// @vitest-environment jsdom
// 이동 기록의 계약 — 뒤로가 "되돌아가기" 인가. 화면이 아니라 store 가 정하는 부분만 본다.
// 셸은 문서 한 자리 + 지식 관리 + 설정이고, 채팅은 뷰가 아니라 옆 칸이다.
import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkbench } from './workbench'
import { EMPTY_HISTORY } from './history'
import { emptyTab } from './tabs'

const reset = (): void => {
  useWorkbench.setState({
    view: 'doc',
    tabs: [emptyTab()],
    tabAt: 0,
    history: EMPTY_HISTORY,
    selectedPage: null,
    selectedSource: null,
    docMode: 'page',
    editing: null,
    editorDirty: false,
    pendingNavigation: null,
    changedFor: null,
    versionPick: null,
    historyFrom: null,
    peek: null,
    peekFrom: null,
    chatOpen: true,
    chatTab: 'chat',
    knowledgeSection: 'sources',
    pages: [{ rel: 'wiki/a.md', title: 'A' }] as never,
    docs: [{ rel: 'projects/p/plan.md', title: '계획' }] as never
  })
}

describe('setView', () => {
  beforeEach(reset)

  it('메뉴 전환을 기록에 쌓는다 — 뒤로가 와 본 적 없는 페이지로 가지 않는다', () => {
    useWorkbench.getState().setView('knowledge')
    useWorkbench.getState().back()
    expect(useWorkbench.getState().view).toBe('doc')
  })

  it('같은 뷰를 다시 눌러도 기록이 늘지 않는다', () => {
    useWorkbench.getState().setView('knowledge')
    const before = useWorkbench.getState().history.entries.length
    useWorkbench.getState().setView('knowledge')
    expect(useWorkbench.getState().history.entries.length).toBe(before)
  })

  it('편집 중이어도 묻지 않는다 — 탭은 숨을 뿐 쓰던 글이 남는다', () => {
    useWorkbench.setState({ editing: 'wiki/a.md', editorDirty: true })
    useWorkbench.getState().setView('knowledge')
    expect(useWorkbench.getState().pendingNavigation).toBeNull()
    expect(useWorkbench.getState().view).toBe('knowledge')
  })
})

describe('채팅 칸', () => {
  beforeEach(reset)

  it('기본으로 열려 있다 — 하루 루프의 일은 옆 칸에 시킨다', () => {
    expect(useWorkbench.getState().chatOpen).toBe(true)
  })

  it('닫았다 다시 열면 마지막 탭으로 돌아온다', () => {
    useWorkbench.getState().openChat('ingest')
    useWorkbench.getState().toggleChat()
    expect(useWorkbench.getState().chatOpen).toBe(false)
    useWorkbench.getState().toggleChat()
    expect(useWorkbench.getState().chatOpen).toBe(true)
    expect(useWorkbench.getState().chatTab).toBe('ingest')
  })

  it('묻기는 칸을 열고 채팅 탭으로 옮기고 입력칸에 초점을 준다', () => {
    useWorkbench.setState({ chatOpen: false, chatTab: 'ingest', chatFocusAt: 0 })
    useWorkbench.getState().askChat()
    const state = useWorkbench.getState()
    expect(state.chatOpen).toBe(true)
    expect(state.chatTab).toBe('chat')
    expect(state.chatFocusAt).toBeGreaterThan(0)
  })

  it('근거를 닫으면 열기 전 탭으로 돌아간다 — 근거 안에서 옮겨 다녀도 처음 자리', () => {
    useWorkbench.setState({ chatOpen: true, chatTab: 'ingest' })
    useWorkbench.getState().openPeek('wiki/a.md')
    useWorkbench.getState().openPeek('wiki/b.md')
    expect(useWorkbench.getState().peekFrom).toBe('ingest')
    useWorkbench.getState().closePeek()
    expect(useWorkbench.getState()).toMatchObject({ chatTab: 'ingest', peek: null })

    // 옆 칸이 닫혀 있었으면 돌아갈 탭은 채팅이다
    useWorkbench.setState({ chatOpen: false, chatTab: 'ingest' })
    useWorkbench.getState().openPeek('wiki/a.md', null, true)
    expect(useWorkbench.getState().peek).toEqual({ rel: 'wiki/a.md', line: null, cited: true })
    useWorkbench.getState().closePeek()
    expect(useWorkbench.getState().chatTab).toBe('chat')
  })

  it('중앙이 움직여 근거가 접히면 연 탭으로 돌아가고 연 자리를 버린다', () => {
    useWorkbench.setState({ chatOpen: true, chatTab: 'ingest' })
    useWorkbench.getState().openPeek('wiki/a.md')
    useWorkbench.getState().navigate('wiki/a.md')
    expect(useWorkbench.getState()).toMatchObject({
      peek: null,
      peekFrom: null,
      chatTab: 'ingest'
    })
  })

  it('근거 문서가 지워지면 연 탭으로 돌아가고 연 자리를 버린다', () => {
    useWorkbench.setState({ chatOpen: true, chatTab: 'ingest' })
    useWorkbench.getState().openPeek('wiki/a.md')
    useWorkbench.getState().relocated('wiki/a.md', null)
    expect(useWorkbench.getState()).toMatchObject({ peek: null, peekFrom: null, chatTab: 'ingest' })
  })

  it('탭을 직접 고르면 기록 단추의 돌아갈 자리를 버린다', () => {
    useWorkbench.setState({ chatOpen: true, chatTab: 'ingest' })
    useWorkbench.getState().toggleHistory()
    expect(useWorkbench.getState().historyFrom).toEqual({ tab: 'ingest', open: true })
    useWorkbench.getState().openChat('chat')
    expect(useWorkbench.getState().historyFrom).toBeNull()
  })

  it('근거 읽기·위키화는 중앙을 빼앗지 않고 옆 칸의 탭만 바꾼다', () => {
    useWorkbench.getState().openPeek('wiki/a.md', 3)
    expect(useWorkbench.getState().view).toBe('doc')
    expect(useWorkbench.getState().chatTab).toBe('peek')
    useWorkbench.getState().requestIngest()
    expect(useWorkbench.getState().chatTab).toBe('ingest')
    expect(useWorkbench.getState().view).toBe('doc')
  })

  it('설정에서 시작하기를 열면 돌아올 길이 남고, 딴 데로 가면 버린다', () => {
    useWorkbench.setState({ view: 'settings', startFrom: null })
    useWorkbench.getState().reopenStart()
    expect(useWorkbench.getState()).toMatchObject({ view: 'start', startFrom: 'settings' })
    useWorkbench.getState().setView('doc')
    expect(useWorkbench.getState().startFrom).toBeNull()
  })

  it('밖에서 옆 칸을 열면 초점 신호가 울리고, 탭 직접 이동은 조용하다', () => {
    useWorkbench.setState({ sidecarFocusAt: 0 })
    useWorkbench.getState().openChat('ingest')
    expect(useWorkbench.getState().sidecarFocusAt).toBe(0)
    useWorkbench.getState().openChat('ingest', { focus: true })
    expect(useWorkbench.getState().sidecarFocusAt).toBeGreaterThan(0)

    useWorkbench.setState({ sidecarFocusAt: 0, chatOpen: false, chatTab: 'chat' })
    useWorkbench.getState().toggleHistory()
    expect(useWorkbench.getState().chatTab).toBe('history')
    expect(useWorkbench.getState().sidecarFocusAt).toBeGreaterThan(0)

    useWorkbench.setState({ sidecarFocusAt: 0 })
    useWorkbench.getState().openPeek('wiki/a.md')
    expect(useWorkbench.getState().sidecarFocusAt).toBeGreaterThan(0)

    useWorkbench.setState({ sidecarFocusAt: 0 })
    useWorkbench.getState().requestIngest()
    expect(useWorkbench.getState().sidecarFocusAt).toBeGreaterThan(0)
  })
})

describe('back', () => {
  beforeEach(reset)

  it('프로젝트 문서 칸을 지워진 페이지로 보지 않는다 — 위키 목록 밖에도 문서가 있다', () => {
    useWorkbench.getState().navigate('projects/p/plan.md')
    useWorkbench.getState().navigate('wiki/a.md')
    useWorkbench.getState().back()
    expect(useWorkbench.getState().selectedPage).toBe('projects/p/plan.md')
  })

  it('편집 중이면 먼저 묻는다 — 뒤로는 편집기를 없앤다', () => {
    useWorkbench.getState().navigate('wiki/a.md')
    useWorkbench.setState({ editing: 'wiki/a.md', editorDirty: true })
    useWorkbench.getState().back()
    expect(useWorkbench.getState().pendingNavigation).not.toBeNull()
  })
})

describe('openToday', () => {
  beforeEach(reset)

  it('오늘 노트가 없으면 문서 자리를 리더로 되돌린다 — 미리보기를 보던 중에도 띠에 닿는다', () => {
    useWorkbench.getState().openFile('raw/note.pdf')
    useWorkbench.getState().setView('knowledge')
    useWorkbench.getState().openToday(null)
    const state = useWorkbench.getState()
    expect(state.view).toBe('doc')
    expect(state.docMode).toBe('page')
  })

  it('노트가 있으면 그 노트를 연다', () => {
    useWorkbench.getState().openToday('private/2026-09-18.md')
    const state = useWorkbench.getState()
    expect(state.view).toBe('doc')
    expect(state.docMode).toBe('page')
    expect(state.selectedPage).toBe('private/2026-09-18.md')
  })
})

describe('openFile', () => {
  beforeEach(reset)

  it('md 가 아닌 파일은 같은 자리에서 미리보기로 열린다 — 자료 뷰로 튀지 않는다', () => {
    useWorkbench.setState({ view: 'knowledge' })
    useWorkbench.getState().openFile('raw/note.pdf')
    const state = useWorkbench.getState()
    expect(state.view).toBe('doc')
    expect(state.docMode).toBe('source')
    expect(state.selectedSource).toBe('raw/note.pdf')
  })

  it('md 는 리더로 열고 미리보기를 끈다', () => {
    useWorkbench.getState().openFile('raw/note.pdf')
    useWorkbench.getState().openFile('wiki/a.md')
    const state = useWorkbench.getState()
    expect(state.docMode).toBe('page')
    expect(state.selectedPage).toBe('wiki/a.md')
  })

  it('미리보기로 옮긴 것도 기록에 쌓인다', () => {
    useWorkbench.getState().navigate('wiki/a.md')
    useWorkbench.getState().openFile('raw/note.pdf')
    useWorkbench.getState().back()
    expect(useWorkbench.getState().docMode).toBe('page')
    expect(useWorkbench.getState().selectedPage).toBe('wiki/a.md')
  })
})

describe('openDocument', () => {
  beforeEach(reset)

  it('중앙이 문서일 때만 그 문서를 돌려준다 — 지식 관리를 보는 중이면 없다', () => {
    expect(useWorkbench.getState().openDocument()).toBeNull()
    useWorkbench.getState().navigate('wiki/a.md')
    expect(useWorkbench.getState().openDocument()).toBe('wiki/a.md')
    useWorkbench.getState().openFile('raw/x.pdf')
    expect(useWorkbench.getState().openDocument()).toBe('raw/x.pdf')
    useWorkbench.getState().setView('knowledge')
    expect(useWorkbench.getState().openDocument()).toBeNull()
  })
})

describe('showChangedFile', () => {
  beforeEach(reset)

  it('편집 중이면 열지 않는다', () => {
    useWorkbench.setState({ selectedPage: 'wiki/a.md', editing: 'wiki/a.md' })
    expect(useWorkbench.getState().showChangedFile('private/2026-09-17.md')).toBe(false)
    expect(useWorkbench.getState().selectedPage).toBe('wiki/a.md')
    useWorkbench.setState({ editing: null, editorDirty: true })
    expect(useWorkbench.getState().showChangedFile('private/2026-09-17.md')).toBe(false)
  })

  it('만든 파일을 중앙에 연다 — 채팅은 옆에 그대로 있다', () => {
    useWorkbench.setState({ view: 'knowledge' })
    expect(useWorkbench.getState().showChangedFile('private/2026-09-17.md')).toBe(true)
    const state = useWorkbench.getState()
    expect(state.chatOpen).toBe(true)
    expect(state.view).toBe('doc')
    expect(state.selectedPage).toBe('private/2026-09-17.md')
  })
})

describe('바뀐 곳', () => {
  beforeEach(reset)

  it('카드의 "바뀐 곳" 은 그 파일을 열고 이번 답을 기준으로 잡는다', () => {
    useWorkbench.setState({ view: 'knowledge' })
    useWorkbench.getState().showChanges('private/2026-09-17.md', 'run-1')
    const state = useWorkbench.getState()
    expect(state.view).toBe('doc')
    expect(state.selectedPage).toBe('private/2026-09-17.md')
    expect(state.changedFor).toEqual({
      rel: 'private/2026-09-17.md',
      since: { change: 'run-1' },
      changeId: 'run-1'
    })
  })

  it('쓰던 글이 있으면 카드의 "바뀐 곳" 도 확인을 기다린다 — 이동 가드를 건너뛰지 않는다', () => {
    useWorkbench.setState({ selectedPage: 'wiki/a.md', editorDirty: true })
    useWorkbench.getState().showChanges('private/2026-09-17.md', 'run-1')
    const state = useWorkbench.getState()
    expect(state.selectedPage).toBe('wiki/a.md')
    expect(state.pendingNavigation).not.toBeNull()
    expect(state.changedFor).toBeNull()
  })

  it('헤더 토글은 열린 문서에만 걸리고, 다시 누르면 꺼진다', () => {
    useWorkbench.setState({ selectedPage: 'wiki/a.md' })
    useWorkbench.getState().setChangedSince('today')
    expect(useWorkbench.getState().changedFor).toEqual({
      rel: 'wiki/a.md',
      since: 'today',
      changeId: null
    })
    useWorkbench.getState().setChangedSince(null)
    expect(useWorkbench.getState().changedFor).toBeNull()
  })

  it('다른 문서로 기준을 옮기면 이번 답 기준은 따라가지 않는다', () => {
    useWorkbench.getState().showChanges('private/2026-09-17.md', 'run-1')
    useWorkbench.getState().setChangedSince('yesterday')
    expect(useWorkbench.getState().changedFor?.changeId).toBe('run-1')
    useWorkbench.setState({ selectedPage: 'wiki/a.md' })
    useWorkbench.getState().setChangedSince('yesterday')
    expect(useWorkbench.getState().changedFor).toEqual({
      rel: 'wiki/a.md',
      since: 'yesterday',
      changeId: null
    })
  })
})

describe('지식 관리', () => {
  beforeEach(reset)

  it('구역을 고르면 중앙이 지식 관리로 바뀌고 그 구역이 열린다', () => {
    useWorkbench.getState().openKnowledge('review')
    const state = useWorkbench.getState()
    expect(state.view).toBe('knowledge')
    expect(state.knowledgeSection).toBe('review')
  })

  it('본문에서 찾기는 검색 구역을 열고 질의를 넘긴다', () => {
    useWorkbench.getState().searchText('회의록')
    const state = useWorkbench.getState()
    expect(state.view).toBe('knowledge')
    expect(state.knowledgeSection).toBe('search')
    expect(state.searchRequest?.query).toBe('회의록')
  })
})

describe('relocated', () => {
  beforeEach(reset)

  it('열린 문서의 이름이 바뀌면 새 경로를 연다', () => {
    useWorkbench.setState({ selectedPage: 'private/a.md', recent: ['private/a.md', 'wiki/b.md'] })
    useWorkbench.getState().relocated('private/a.md', 'private/새 이름.md')
    expect(useWorkbench.getState().selectedPage).toBe('private/새 이름.md')
    expect(useWorkbench.getState().recent).toEqual(['private/새 이름.md', 'wiki/b.md'])
  })

  it('폴더를 옮기면 그 안의 열린 문서도 따라간다 — 이름이 앞부분만 같은 폴더는 그대로다', () => {
    useWorkbench.setState({
      selectedPage: 'private/old/a.md',
      selectedSource: 'private/older/x.png'
    })
    useWorkbench.getState().relocated('private/old', 'projects/old')
    expect(useWorkbench.getState().selectedPage).toBe('projects/old/a.md')
    expect(useWorkbench.getState().selectedSource).toBe('private/older/x.png')
  })

  it('지우면 열린 문서·옆 칸 근거가 닫히고 채팅 탭으로 돌아온다', () => {
    useWorkbench.setState({
      selectedPage: 'private/a.md',
      recent: ['private/a.md'],
      peek: { rel: 'private/a.md', line: null },
      chatTab: 'peek'
    })
    useWorkbench.getState().relocated('private/a.md', null)
    const state = useWorkbench.getState()
    expect(state.selectedPage).toBeNull()
    expect(state.recent).toEqual([])
    expect(state.peek).toBeNull()
    expect(state.chatTab).toBe('chat')
  })

  it('고른 버전의 문서가 옮겨지면 따라가고, 지워지면 내려놓는다 — 기록 탭은 그대로 둔다', () => {
    useWorkbench.getState().toggleHistory()
    useWorkbench.getState().pickVersion({ rel: 'private/old/a.md', version: V1 })
    useWorkbench.getState().relocated('private/old', 'projects/old')
    expect(useWorkbench.getState().versionPick).toEqual({ rel: 'projects/old/a.md', version: V1 })
    useWorkbench.getState().relocated('projects/old/a.md', null)
    expect(useWorkbench.getState().versionPick).toBeNull()
    expect(useWorkbench.getState().chatTab).toBe('history')
  })
})

const V1 = { rev: 'r1', kind: 'me' as const, author: 'alice', date: '2026-10-02T10:00:00+09:00' }

describe('기록', () => {
  beforeEach(reset)

  it('기록 단추는 옆 칸 기록 탭을 열고, 다시 누르면 열기 전 자리(닫혀 있었으면 닫힘)로 돌아간다', () => {
    useWorkbench.setState({ chatOpen: false, chatTab: 'ingest' })
    useWorkbench.getState().toggleHistory()
    expect(useWorkbench.getState()).toMatchObject({ chatOpen: true, chatTab: 'history' })
    useWorkbench.getState().toggleHistory()
    expect(useWorkbench.getState()).toMatchObject({ chatOpen: false, chatTab: 'ingest' })

    useWorkbench.setState({ chatOpen: true, chatTab: 'ingest' })
    useWorkbench.getState().toggleHistory()
    useWorkbench.getState().toggleHistory()
    expect(useWorkbench.getState()).toMatchObject({ chatOpen: true, chatTab: 'ingest' })
  })

  it('고른 버전만 든다 — 내려놓으면 비운다', () => {
    useWorkbench.getState().pickVersion({ rel: 'wiki/a.md', version: V1 })
    expect(useWorkbench.getState().versionPick).toEqual({ rel: 'wiki/a.md', version: V1 })
    useWorkbench.getState().pickVersion(null)
    expect(useWorkbench.getState().versionPick).toBeNull()
  })
})

describe('탭', () => {
  beforeEach(reset)

  const tabs = (): ReturnType<typeof useWorkbench.getState>['tabs'] => useWorkbench.getState().tabs
  const at = (): number => useWorkbench.getState().tabAt

  it('새 탭은 빈 자리로 열리고, 보던 문서는 접힌 탭에 남는다', () => {
    useWorkbench.getState().navigate('wiki/a.md')
    useWorkbench.getState().newTab()
    expect(tabs()).toHaveLength(2)
    expect(at()).toBe(1)
    expect(useWorkbench.getState().selectedPage).toBeNull()
    expect(tabs()[0].page).toBe('wiki/a.md')
  })

  it('탭을 돌아오면 그 탭이 보던 문서가 돌아온다', () => {
    useWorkbench.getState().navigate('wiki/a.md')
    useWorkbench.getState().newTab()
    useWorkbench.getState().navigate('projects/p/plan.md')
    useWorkbench.getState().openTab(tabs()[0].id)
    expect(useWorkbench.getState().selectedPage).toBe('wiki/a.md')
    useWorkbench.getState().openTab(tabs()[1].id)
    expect(useWorkbench.getState().selectedPage).toBe('projects/p/plan.md')
  })

  it('뒤로 기록은 탭마다 따로다 — 옆 탭에서 연 문서로 되돌아가지 않는다', () => {
    useWorkbench.getState().navigate('wiki/a.md')
    useWorkbench.getState().newTab()
    useWorkbench.getState().navigate('projects/p/plan.md')
    useWorkbench.getState().back()
    // 새 탭의 기록은 "빈 탭 → plan" 하나뿐이다
    expect(useWorkbench.getState().selectedPage).toBeNull()
    useWorkbench.getState().back()
    expect(useWorkbench.getState().selectedPage).toBeNull()
  })

  it('새 탭으로 열기는 지금 탭을 그대로 두고 옆에 연다', () => {
    useWorkbench.getState().navigate('wiki/a.md')
    useWorkbench.getState().openFile('projects/p/plan.md', true)
    expect(tabs()).toHaveLength(2)
    expect(tabs()[0].page).toBe('wiki/a.md')
    expect(useWorkbench.getState().selectedPage).toBe('projects/p/plan.md')
  })

  it('문서로 바로 연 새 탭에는 뒤로 갈 빈 자리가 없다', () => {
    useWorkbench.getState().navigate('wiki/a.md')
    useWorkbench.getState().openFile('projects/p/plan.md', true)
    expect(useWorkbench.getState().history).toMatchObject({
      cursor: 0,
      entries: [{ view: 'doc', page: 'projects/p/plan.md' }]
    })
    useWorkbench.getState().back()
    expect(useWorkbench.getState().selectedPage).toBe('projects/p/plan.md')
  })

  it('md 가 아닌 파일도 새 탭으로 열린다', () => {
    useWorkbench.getState().openFile('raw/shot.png', true)
    expect(useWorkbench.getState().docMode).toBe('source')
    expect(useWorkbench.getState().selectedSource).toBe('raw/shot.png')
    expect(tabs()).toHaveLength(2)
  })

  it('보던 탭을 닫으면 옆 탭이 켜진다', () => {
    useWorkbench.getState().navigate('wiki/a.md')
    useWorkbench.getState().openFile('projects/p/plan.md', true)
    useWorkbench.getState().closeTab(tabs()[1].id)
    expect(tabs()).toHaveLength(1)
    expect(useWorkbench.getState().selectedPage).toBe('wiki/a.md')
  })

  it('뒤에 있는 탭을 닫아도 보고 있던 문서는 그대로다', () => {
    useWorkbench.getState().navigate('wiki/a.md')
    useWorkbench.getState().openFile('projects/p/plan.md', true)
    useWorkbench.getState().closeTab(tabs()[0].id)
    expect(tabs()).toHaveLength(1)
    expect(useWorkbench.getState().selectedPage).toBe('projects/p/plan.md')
  })

  it('마지막 한 장은 닫는 대신 비운다 — 갈 곳 없는 창을 만들지 않는다', () => {
    useWorkbench.getState().navigate('wiki/a.md')
    useWorkbench.getState().closeTab(tabs()[0].id)
    expect(tabs()).toHaveLength(1)
    expect(useWorkbench.getState().selectedPage).toBeNull()
  })

  it('쓰던 글이 있으면 탭을 옮기기 전에 묻는다', () => {
    useWorkbench.getState().navigate('wiki/a.md')
    useWorkbench.getState().newTab()
    useWorkbench.setState({ editing: 'wiki/a.md', editorDirty: true })
    useWorkbench.getState().openTab(tabs()[0].id)
    expect(useWorkbench.getState().pendingNavigation).not.toBeNull()
    expect(at()).toBe(1)
    useWorkbench.getState().confirmNavigation()
    expect(at()).toBe(0)
  })

  it('이름이 바뀐 파일은 접어 둔 탭에서도 따라 옮긴다', () => {
    useWorkbench.getState().navigate('wiki/a.md')
    useWorkbench.getState().newTab()
    useWorkbench.getState().relocated('wiki/a.md', 'wiki/b.md')
    expect(tabs()[0].page).toBe('wiki/b.md')
  })
})
