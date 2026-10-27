// 명령 표 — 단축키(hooks/use-workbench-shortcuts.ts)와 팔레트 명령 모드(components/palette.tsx)가 같은 표를 읽는다.
// 여기 없는 단축키는 없다(Escape 만 훅이 직접 — 명령이 아니라 "열린 것 닫기" 다).
// 팔레트가 떠 있는 동안은 훅이 팔레트 여닫기 말고는 다 막는다 — 여기 `when` 은 팔레트 안 목록에도 쓰이니 팔레트를 보지 않는다.
// Mod 는 macOS ⌘, 그 밖은 Ctrl. Alt 를 더한 것은 탭 — Mod+T 를 그대로 쓰지 않는 이유는 임자가 있어서다(오늘 노트).
// Mod+W 는 이 탭 닫기 — main 이 기본 메뉴의 창 닫기보다 먼저 가로챈다(메뉴에 닫기를 두지 않는다).
import { todayNotesOf } from '../hooks/use-today'
import { randomPage } from './random-page'
import type { WorkbenchState } from '../store/workbench'
import { getT } from './i18n'

const isMac = navigator.userAgent.includes('Mac')
const MOD = isMac ? '⌘' : 'Ctrl+'
const ALT = isMac ? '⌥⌘' : 'Ctrl+Alt+'

/** 키가 눌린 자리 — 글을 고치는 중이면 대부분 명령이 양보한다 */
export type KeyGuard = {
  /** 위키 편집기(.cm-editor)·contentEditable 안 */
  editing: boolean
  /** 여러 줄 입력칸(채팅) 안 — 뒤로·앞으로만 더 양보한다 */
  textarea: boolean
}

export type Command = {
  id: string
  label: string
  /** Mod(+Alt)+code — 없으면 팔레트에서만 부른다 */
  shortcut?: { code: string; alt?: boolean }
  /** 팔레트 행에 보이는 글자 — 단축키 없는 명령은 없다 */
  keys?: string
  /** 참이면 팔레트 목록에서 숨긴다 — 단축키로만 부른다(숫자 탭 이동) */
  hidden?: boolean
  /** 지금 부를 수 있나 — 단축키는 양보, 팔레트는 숨김 */
  when?: (s: WorkbenchState, g: KeyGuard) => boolean
  run: (s: WorkbenchState) => void
}

const noEdit = (_s: WorkbenchState, g: KeyGuard): boolean => !g.editing
const onPage = (s: WorkbenchState): boolean => s.view === 'doc' && s.selectedPage !== null
const activeTabId = (s: WorkbenchState): string => s.tabs[s.tabAt].id
const wikiRels = (s: WorkbenchState): string[] => (s.pages ?? []).map((p) => p.rel)

// 이름은 읽는 시점의 화면 언어 — 표는 상수지만 문구는 굳히지 않는다
export const COMMANDS: Command[] = [
  // 둘 다 같은 팔레트 — 떠 있으면 닫고, 아니면 미리 채울 글자만 다르게 연다
  {
    id: 'palette',
    get label() {
      return getT().commands.palette
    },
    shortcut: { code: 'KeyK' },
    keys: `${MOD}K`,
    run: (s) => (s.paletteOpen ? s.setPaletteOpen(false) : s.openPalette(''))
  },
  {
    id: 'palette-commands',
    get label() {
      return getT().commands.paletteCommands
    },
    shortcut: { code: 'KeyP' },
    keys: `${MOD}P`,
    run: (s) => (s.paletteOpen ? s.setPaletteOpen(false) : s.openPalette('>'))
  },
  {
    id: 'today',
    get label() {
      return getT().commands.today
    },
    shortcut: { code: 'KeyT' },
    keys: `${MOD}T`,
    when: noEdit,
    run: (s) => s.openToday(todayNotesOf(s.tree).today?.rel ?? null)
  },
  {
    id: 'random-page',
    get label() {
      return getT().commands.randomPage
    },
    // 팔레트에서만 부른다 — 고를 페이지가 있을 때만 목록에 보인다
    when: (s, g) => noEdit(s, g) && randomPage(wikiRels(s), s.selectedPage) !== null,
    run: (s) => {
      const rel = randomPage(wikiRels(s), s.selectedPage)
      if (rel !== null) s.navigate(rel)
    }
  },
  {
    id: 'ask',
    get label() {
      return getT().commands.ask
    },
    shortcut: { code: 'KeyJ' },
    keys: `${MOD}J`,
    when: noEdit,
    run: (s) => s.askChat()
  },
  {
    id: 'chat-toggle',
    get label() {
      return getT().commands.chatToggle
    },
    shortcut: { code: 'Backslash' },
    keys: `${MOD}\\`,
    when: noEdit,
    run: (s) => s.toggleChat()
  },
  {
    id: 'find',
    get label() {
      return getT().commands.find
    },
    shortcut: { code: 'KeyF' },
    keys: `${MOD}F`,
    // 편집 중이면(초점이 도구띠에 있어도) CodeMirror 의 찾기·바꾸기 패널(basicSetup searchKeymap) 몫이다
    when: (s, g) => !g.editing && s.editing === null && onPage(s),
    run: (s) => s.setFindFor(s.selectedPage)
  },
  {
    id: 'back',
    get label() {
      return getT().commands.back
    },
    shortcut: { code: 'BracketLeft' },
    keys: `${MOD}[`,
    // CodeMirror 기본 키맵(내어쓰기·들여쓰기)과 채팅 입력칸에 양보한다
    when: (_s, g) => !g.editing && !g.textarea,
    // 웹 탭에서는 브라우저처럼 그 페이지의 뒤로다 — 탭 기록은 문서 칸을 오간다
    run: (s) => (s.view === 'web' ? void window.api.webBack(activeTabId(s)) : s.back())
  },
  {
    id: 'forward',
    get label() {
      return getT().commands.forward
    },
    shortcut: { code: 'BracketRight' },
    keys: `${MOD}]`,
    when: (_s, g) => !g.editing && !g.textarea,
    run: (s) => (s.view === 'web' ? void window.api.webForward(activeTabId(s)) : s.forward())
  },
  {
    id: 'tab-new',
    get label() {
      return getT().commands.tabNew
    },
    shortcut: { code: 'KeyT', alt: true },
    keys: `${ALT}T`,
    run: (s) => s.newTab()
  },
  {
    id: 'note-new',
    get label() {
      return getT().commands.noteNew
    },
    shortcut: { code: 'KeyN' },
    keys: `${MOD}N`,
    // 탭 열기와 같은 길이다 — 파일을 만들지 않는다. 만들기는 빈 탭의 "새 노트 만들기"가 맡는다.
    // 팔레트에는 tab-new(⌥⌘T)가 있으므로 여기서는 숨긴다
    hidden: true,
    run: (s) => s.newTab()
  },
  {
    id: 'tab-close',
    get label() {
      return getT().commands.tabClose
    },
    // 팔레트에는 ⌥⌘W만 보인다 — ⌘W는 단축키 표에 둘 수 없고(한 키 하나) main 이 가로채 renderer 로 돌린다
    shortcut: { code: 'KeyW', alt: true },
    keys: `${ALT}W`,
    run: (s) => s.closeTab(s.tabs[s.tabAt].id)
  },
  {
    id: 'tab-prev',
    get label() {
      return getT().commands.tabPrev
    },
    shortcut: { code: 'BracketLeft', alt: true },
    keys: `${ALT}[`,
    run: (s) => s.openTab(s.tabs[(s.tabAt - 1 + s.tabs.length) % s.tabs.length].id)
  },
  {
    id: 'tab-next',
    get label() {
      return getT().commands.tabNext
    },
    shortcut: { code: 'BracketRight', alt: true },
    keys: `${ALT}]`,
    run: (s) => s.openTab(s.tabs[(s.tabAt + 1) % s.tabs.length].id)
  },
  // 숫자 탭 이동 — 브라우저와 같이 1–8은 그 자리, 9는 막탭. 없는 번호는 가만히 있다
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n): Command => ({
    id: `tab-${n}`,
    get label() {
      return getT().commands.tabN(n)
    },
    shortcut: { code: `Digit${n}` },
    hidden: true,
    when: noEdit,
    run: (s) => {
      const tab = s.tabs[n - 1]
      if (tab) s.openTab(tab.id)
    }
  })),
  {
    id: 'tab-last',
    get label() {
      return getT().commands.tabLast
    },
    shortcut: { code: 'Digit9' },
    hidden: true,
    when: noEdit,
    run: (s) => {
      const tab = s.tabs[s.tabs.length - 1]
      if (tab) s.openTab(tab.id)
    }
  }
]

/** 눌린 키에 맞는 명령 — Mod 는 호출자가 이미 확인했다 */
export const commandForKey = (code: string, alt: boolean): Command | undefined =>
  COMMANDS.find(
    (c) => c.shortcut !== undefined && c.shortcut.code === code && (c.shortcut.alt ?? false) === alt
  )

const PALETTE_IDS = new Set(['palette', 'palette-commands'])

/** 지금 부를 수 있는 명령 — 팔레트 목록. 팔레트 자신은 뺀다. 초점 대신 store 의 편집 상태로 양보를 잰다 */
export const availableCommands = (s: WorkbenchState): Command[] => {
  const g: KeyGuard = { editing: s.editing !== null, textarea: false }
  return COMMANDS.filter((c) => !c.hidden && !PALETTE_IDS.has(c.id) && (c.when?.(s, g) ?? true))
}

/** 팔레트가 떠 있는 동안 단축키로 부를 수 있는 명령 — 팔레트 여닫기뿐 */
export const allowedWhilePaletteOpen = (id: string): boolean => PALETTE_IDS.has(id)
