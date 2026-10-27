import { useCallback, useEffect, useRef, useState } from 'react'
import { PanelLeft, PanelRight } from 'lucide-react'
import { Sidebar } from './components/layout/sidebar'
import { PanelResizeHandle } from './components/layout/panel-resize-handle'
import { ViewIdProvider } from './components/layout/view-id-provider'
import { DocTabs } from './components/layout/doc-tabs'
import {
  CHAT_DEFAULT_WIDTH,
  CHAT_MIN_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  chatFloats,
  chatMaxFor,
  fitsSidebar,
  floatingChatWidth,
  mainMinFor,
  sidebarMaxFor
} from './components/layout/shell-fit'
import { usePanelWidth } from './components/layout/use-panel-width'
import { Button } from './components/ui/button'
import { cn } from './lib/utils'
import { SetupGate, SetupProvider, type SetupNeed } from './components/setup-gate'
import { useSetup } from './hooks/use-setup'
import { setupComplete } from './lib/start-steps'
import { markStartDone } from './lib/start-done'
import { IngestSection } from './pages/IngestSection'
import { useWorkbench, type ViewId } from './store/workbench'
import SettingsView from './views/settings-view'
import { StartView } from './views/start-view'
import { KnowledgeView } from './views/knowledge-view'
import { DocView } from './views/doc-view'
import { WebView } from './views/web-view'
import { PeekPane } from './views/wiki/peek-pane'
import { HistoryPane } from './views/wiki/history-pane'
import { ChatPanel } from './views/chat/chat-panel'
import { CHAT_TABS } from './views/chat/chat-tabs'
import { ChatPaneHeader } from './views/chat/chat-pane-header'
import { SidecarAnnounce } from './components/layout/sidecar-announce'
import { useChatNarrowInit } from './views/chat/use-chat-narrow-init'
import { ChatProvider } from './views/chat/chat-provider'
import { Palette } from './components/palette'
import { NavigationGuard } from './components/navigation-guard'
import { useWorkbenchShortcuts } from './hooks/use-workbench-shortcuts'
import { useCloseTabKey } from './hooks/use-close-tab-key'
import { useWebEvents } from './hooks/use-web-events'
import { useT } from './lib/i18n'

// 중앙은 한 번 마운트하면 숨기기만 한다 — 오가도 입력·선택·스크롤이 남는다.
// needs 가 끝나기 전에는 SetupGate 가 내용 대신 설정으로 가는 버튼을 보여 준다.
const VIEWS: { id: ViewId; needs: SetupNeed[]; Content: () => React.JSX.Element | null }[] = [
  { id: 'start', needs: [], Content: StartView },
  { id: 'doc', needs: ['vault'], Content: DocView },
  // 웹 탭은 보관함 없이도 연다 — 담기만 보관함을 쓴다
  { id: 'web', needs: [], Content: WebView },
  { id: 'knowledge', needs: ['vault'], Content: KnowledgeView },
  { id: 'settings', needs: [], Content: SettingsView }
]

// 옆 칸의 세입자 목록은 머리글이 들고 있다 — 칸·탭·진행 점이 한 곳에 있다.
const SIDEBAR_SHOWN_KEY = 'second-brain.sidebar.shown'

/** 접어 둔 사이드바는 다음 실행에도 접혀 있다 — 껐다 켤 때마다 다시 접는 일은 없다 */
const storedSidebarShown = (): boolean => {
  try {
    return localStorage.getItem(SIDEBAR_SHOWN_KEY) !== 'no'
  } catch {
    return true
  }
}

const rememberSidebarShown = (shown: boolean): void => {
  try {
    localStorage.setItem(SIDEBAR_SHOWN_KEY, shown ? 'yes' : 'no')
  } catch {
    // 저장이 막혀도 이번 실행에서는 바뀐다
  }
}

/**
 * 연결과 보관함이 끝난 순간을 한 번 기록한다 — 다음 실행부터 오늘 노트로 연다.
 * 어느 뷰로 여는지는 store 가 이 기록만 보고 정하므로(lib/start-done.ts) 여기서 뷰를 바꾸지 않는다.
 */
const StartLanding = (): null => {
  const { engine, vault } = useSetup()
  const complete = setupComplete({ engine, vault })
  useEffect(() => {
    if (complete) markStartDone()
  }, [complete])
  return null
}

function App(): React.JSX.Element {
  const t = useT()
  const view = useWorkbench((s) => s.view)
  const chatOpen = useWorkbench((s) => s.chatOpen)
  const chatTab = useWorkbench((s) => s.chatTab)
  const toggleChat = useWorkbench((s) => s.toggleChat)
  const openKnowledge = useWorkbench((s) => s.openKnowledge)
  const refreshPages = useWorkbench((s) => s.refreshPages)
  const refreshDocs = useWorkbench((s) => s.refreshDocs)
  const refreshTree = useWorkbench((s) => s.refreshTree)
  const refreshChanges = useWorkbench((s) => s.refreshChanges)
  const refreshBookmarks = useWorkbench((s) => s.refreshBookmarks)
  const [ingestRunning, setIngestRunning] = useState(false)
  useWorkbenchShortcuts()
  useCloseTabKey()
  useWebEvents()
  // 좁은 창으로 열면 채팅 칸은 접힌 채로 — 떠 있는 채팅이 문서를 덮고 토글도 덮는다
  useChatNarrowInit()

  // 창이 좁으면 사이드바가 접힌다 — 채팅이 320 까지 먼저 줄고, 그래도 모자랄 때다.
  // 그때는 토글도 잠근다: 펴 봐야 문서가 제 최소 아래로 눌린다. 채팅 칸을 접으면 자리가 나고 풀린다
  // 화면 확대로 문서·채팅 최소가 나란히 안 들어가면 채팅 칸은 문서 위에 뜬다 — 그때 채팅은 자리를 안 차지한다
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
  const [sidebarShown, setSidebarShown] = useState(storedSidebarShown)
  useEffect(() => {
    const onResize = (): void => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const floating = chatFloats(windowWidth)
  const roomy = fitsSidebar(windowWidth, chatOpen && !floating)
  const sidebarOpen = sidebarShown && roomy
  // 저장은 효과에서 한 번 — 업데이터 안에서 쓰면 StrictMode 개발 빌드가 두 번 쓴다
  useEffect(() => rememberSidebarShown(sidebarShown), [sidebarShown])

  // 떠 있는 채팅 칸은 덮개다 — Esc나 바깥 누르기로 닫힌다. Esc는 칸 안에서만 받는다:
  // 편집기·엿보기의 Esc를 빼앗지 않게. 바깥 누르기는 칸 밖 pointerdown에 받는다(토글 단추 제외).
  const chatPaneRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!floating || !chatOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && chatPaneRef.current?.contains(document.activeElement)) {
        event.stopPropagation()
        toggleChat()
      }
    }
    const onOutside = (event: PointerEvent): void => {
      // 오른쪽 단추 메뉴는 덮개를 닫지 않는다 — 왼단추 누르기에만 닫힌다
      if (event.button !== 0) return
      const target = event.target
      // 채팅 토글 단추는 칸 밖에 있다 — 바깥 닫기와 단추 클릭이 겹치면 토글이 두 번 돌아 netto 0이 된다
      if (target instanceof Element && target.closest('[data-testid="toggle-chat"]')) return
      if (chatPaneRef.current && !chatPaneRef.current.contains(target as Node)) {
        toggleChat()
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onOutside)
    }
  }, [floating, chatOpen, toggleChat])

  // 사이드바 상한은 채팅 칸의 최소 폭을 미리 비켜 준다 — 둘이 각자 자기 상한만 지키면
  // 합이 창을 넘어 문서가 min-width 아래로 눌린다
  const sidebarMax = useCallback(() => sidebarMaxFor(window.innerWidth, chatOpen), [chatOpen])
  const sidebarPanel = usePanelWidth({
    storageKey: 'second-brain.sidebar.width',
    minWidth: SIDEBAR_MIN_WIDTH,
    maxWidth: sidebarMax,
    defaultWidth: SIDEBAR_DEFAULT_WIDTH,
    edge: 'right',
    recheckKey: chatOpen
  })
  // 채팅 칸은 사이드바가 실제로 쓰는 폭을 빼고 남은 자리까지 — 사이드바 상한이 채팅 최소를
  // 지켜 주므로 이 값은 320 아래로 내려가지 않는다
  const chatWidth = sidebarOpen ? sidebarPanel.width : 0
  const chatMax = useCallback(() => chatMaxFor(window.innerWidth, chatWidth), [chatWidth])
  const chatPanel = usePanelWidth({
    storageKey: 'second-brain.chat.width',
    minWidth: CHAT_MIN_WIDTH,
    maxWidth: chatMax,
    defaultWidth: CHAT_DEFAULT_WIDTH,
    edge: 'left',
    recheckKey: chatWidth
  })

  useEffect(() => {
    // 진행 점 — main 의 vaultActivity 변화 푸시를 읽는다
    return window.api.onActivityChanged(setIngestRunning)
  }, [])

  // 고급 표시 — 설정 화면에서 바꾸면 store 가 바로 갱신한다. 여기서는 시작할 때 한 번 읽는다
  useEffect(() => {
    void useWorkbench.getState().loadUiPrefs()
  }, [])

  // 창을 닫는 것도 편집기를 떠나는 동작이다 — Electron 은 beforeunload 를 막아도 아무것도 띄우지
  // 않으므로, 여기서 닫기를 취소하고 앱이 쓰는 같은 확인("계속 편집 / 버리기")을 세운다.
  // 버리기를 고르면 closeWindow 가 창을 destroy 로 닫거나(가드를 다시 타지 않는다), ⌘Q 가 막혔던 거면 종료를 잇는다 —
  // 그때 이 가드를 다시 타지만 확인(confirmNavigation)이 먼저 editorDirty 를 풀어 두어 통과한다
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      const { editorDirty, leaveEditor } = useWorkbench.getState()
      if (!editorDirty) return
      event.preventDefault()
      leaveEditor(() => void window.api.closeWindow())
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // 위키 페이지·보관함 문서·파일 트리 — 트리·Cmd+K·근거 인스펙터·기록이 같이 쓴다.
  // 디스크 변경·볼트 전환(빈 rels)마다 다시 읽는다.
  // 자동저장·볼트전환 때는 푸시가 몰린다 — 끝자락 한 번만 읽는다(겹친 왕복이 옛 답으로 덮지 않게)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const fire = (): void => {
      void refreshPages()
      void refreshDocs()
      void refreshTree()
      // 배지는 트리와 같은 신호를 탄다 — 새 푸시 채널도, 감시자 수정도 없다
      void refreshChanges()
      void refreshBookmarks()
    }
    const refresh = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(fire, 150)
    }
    fire()
    const off = window.api.onWikiChanged(refresh)
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      off()
    }
  }, [refreshPages, refreshDocs, refreshTree, refreshChanges, refreshBookmarks])

  return (
    <SetupProvider>
      <ChatProvider>
        <>
          <StartLanding />
          <div className="relative flex h-full">
            {/* 접어도 언마운트하지 않는다 — 편 폴더·스크롤과 센 수가 살아 있어야 한다 */}
            <Sidebar panel={sidebarPanel} shown={sidebarOpen} />

            {/* 문서 자리는 이 폭 아래로 줄지 않는다(창이 그보다 좁을 때만 창 폭) — 창이 좁으면 채팅 칸이 먼저, 그다음 사이드바가 준다.
              최소 폭은 shell-fit 의 상수 하나다 — 클래스로 또 적으면 두 곳이 갈라진다 */}
            <main
              style={{ minWidth: mainMinFor(windowWidth) }}
              className="relative flex flex-1 flex-col bg-background"
            >
              <div className="flex h-9 shrink-0 items-center gap-1 px-2">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={sidebarOpen ? t.shell.sidebarCollapse : t.shell.sidebarExpand}
                  aria-pressed={sidebarOpen}
                  data-testid="toggle-sidebar"
                  title={roomy ? undefined : t.shell.sidebarNarrow}
                  aria-disabled={!roomy}
                  onClick={() => {
                    if (roomy) setSidebarShown((was) => !was)
                  }}
                  className={roomy ? undefined : 'opacity-50'}
                >
                  <PanelLeft aria-hidden />
                </Button>
                <DocTabs />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={chatOpen ? t.shell.chatCollapse : t.shell.chatExpand}
                  aria-pressed={chatOpen}
                  data-testid="toggle-chat"
                  onClick={toggleChat}
                >
                  <PanelRight aria-hidden />
                </Button>
              </div>
              {VIEWS.map(({ id, needs, Content }) => (
                <div
                  key={id}
                  // @container: 뷰 안에서 창이 아니라 중앙 칸의 폭으로 재단한다(목차 자리 등)
                  className={cn(
                    '@container min-h-0 flex-1 flex-col',
                    id === view ? 'flex' : 'hidden'
                  )}
                >
                  <ViewIdProvider id={id}>
                    <SetupGate id={id} needs={needs}>
                      <Content />
                    </SetupGate>
                  </ViewIdProvider>
                </div>
              ))}
            </main>

            {/* 채팅 칸 — 닫아도 언마운트하지 않는다. 진행 중인 위키화의 구독과 대화가 살아 있어야 한다.
              폭 상한은 usePanelWidth 한 곳에만 있다 — 클래스로 또 적으면 두 곳이 갈라진다 */}
            <aside
              ref={chatPaneRef}
              aria-label={t.shell.chatPane}
              data-testid="chat-pane"
              className={cn(
                'flex-col border-l border-hairline bg-sidebar',
                floating ? 'absolute inset-y-0 right-0 z-30 shadow-overlay' : 'relative',
                chatOpen ? 'flex' : 'hidden'
              )}
              style={
                floating
                  ? { width: floatingChatWidth(chatPanel.width, windowWidth) }
                  : { width: chatPanel.width, minWidth: CHAT_MIN_WIDTH }
              }
            >
              <ChatPaneHeader floating={floating} ingestRunning={ingestRunning} />
              <SidecarAnnounce />
              {CHAT_TABS.map((tab) => (
                <div
                  key={tab.id}
                  id={`chat-panel-${tab.id}`}
                  role="tabpanel"
                  tabIndex={chatTab === tab.id ? 0 : -1}
                  aria-labelledby={`chat-tab-${tab.id}`}
                  className={cn(
                    'min-h-0 flex-1 flex-col outline-none',
                    chatTab === tab.id ? 'flex' : 'hidden'
                  )}
                >
                  {tab.id === 'chat' && <ChatPanel />}
                  {tab.id === 'peek' && <PeekPane />}
                  {tab.id === 'ingest' && (
                    <IngestSection
                      onOpenReview={() => openKnowledge('review')}
                      onRunningChange={setIngestRunning}
                    />
                  )}
                  {tab.id === 'history' && <HistoryPane />}
                </div>
              ))}
              <PanelResizeHandle label={t.shell.chatPaneWidth} panel={chatPanel} />
            </aside>
          </div>
          <Palette />
          <NavigationGuard />
        </>
      </ChatProvider>
    </SetupProvider>
  )
}

export default App
