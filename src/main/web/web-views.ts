// 웹 탭의 실물 — 창(렌더러 webContents)마다 탭 id 별 WebContentsView 를 가진다.
// 렌더러는 자리만 알린다: 이 모듈이 view 를 만들고, 그 자리에 붙이고, 숨기고, 파기한다.
// 페이지는 외부 내용이다 — preload·node 없이 sandbox 로, 앱과 나눈 저장 구역(`persist:web`)에 띄운다.
// 로그인은 그 구역에 남아 모든 웹 탭과 다음 실행이 같이 쓴다.
import { BrowserWindow, WebContentsView, shell, type Session, type WebContents } from 'electron'
import { APP_CHANNELS } from '../../shared/ipc-contract'
import type { WebError, WebRect, WebState } from '../../shared/ipc-contract'
import { isWebUrl } from '../../shared/web-address'
import { webKeyOf } from './web-keys'
import { scaleRect } from './web-rect'

export const WEB_PARTITION = 'persist:web'

/** 담기가 페이지를 읽는 격리 world — 페이지 스크립트의 world(0)와 프로토타입을 나누지 않는다 */
const CLIP_WORLD_ID = 1001
const CLIP_READ_MS = 15_000
/** 덮개용 모습을 기다리는 시간 — 그동안 팔레트가 view 밑에 깔려 있으니 짧게 */
const CAPTURE_MS = 1_000

/** 멈춘 페이지는 답을 영영 안 줄 수 있다 — 기다림을 끊는다(넘으면 timeout 으로 거절) */
const within = async <T>(work: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<never>((_done, fail) => {
    timer = setTimeout(() => fail(new Error('timeout')), ms)
  })
  try {
    return await Promise.race([work, late])
  } finally {
    clearTimeout(timer)
  }
}

/** handedOff = 마지막으로 새 탭·기본 브라우저로 넘긴 시각 — 페이지가 클릭 없이 되풀이해 여는 것을 늦춘다 */
type Entry = { view: WebContentsView; error: WebError | null; handedOff: number }

/** 한 탭의 페이지가 새 탭·파일 받기를 넘길 수 있는 간격 */
const HAND_OFF_MS = 1_000

/** 보이는 탭의 페이지이고 직전 넘김에서 HAND_OFF_MS 가 지났으면 넘긴다고 적고 true */
const handOff = (entry: Entry): boolean => {
  const now = Date.now()
  if (!entry.view.getVisible() || now - entry.handedOff < HAND_OFF_MS) return false
  entry.handedOff = now
  return true
}

/** 렌더러 webContents id → 탭 id → view */
const owners = new Map<number, Map<string, Entry>>()
/**
 * view 가 생기기 전에 온 자리 — 창마다 하나(한 창에 보이는 view 는 하나다). 렌더러는 자리를 레이아웃 단계에서,
 * 만들기(`ensure`)는 그 뒤에 보내므로 첫 사각형이 먼저 온다. 버리면 다음 크기 변화까지 페이지가 안 보인다
 */
const early = new Map<number, { tabId: string; rect: WebRect }>()

/** 감시를 붙인 창 — 다시 불러와 view 를 치운 뒤에도 같은 창이면 감시는 그대로 둔다(겹쳐 붙이지 않는다) */
const watched = new WeakSet<WebContents>()

const watchOwner = (owner: WebContents): void => {
  if (watched.has(owner)) return
  watched.add(owner)
  // 창 렌더러가 다시 불러오거나 사라지면 탭 상태도 사라진다 — 남은 view 는 고아가 되므로 같이 치운다
  const drop = (): void => destroyAll(owner)
  owner.once('destroyed', drop)
  owner.on('did-start-navigation', (event) => {
    if (event.isMainFrame && !event.isSameDocument) drop()
  })
  owner.on('render-process-gone', drop)
}

const entriesOf = (owner: WebContents): Map<string, Entry> => {
  watchOwner(owner)
  let entries = owners.get(owner.id)
  if (!entries) {
    entries = new Map()
    owners.set(owner.id, entries)
  }
  return entries
}

/** 정책을 건 저장 구역 — 구역은 앱 전체에 하나라 한 번만 건다 */
const guarded = new WeakSet<Session>()

/**
 * 웹 저장 구역의 정책 — 비개발자에게 권한을 묻지 않는다. 위치·알림·카메라·클립보드 읽기 같은 권한은 전부 거절하고
 * (Electron 기본값은 허락이다), 파일 받기는 앱 안에서 하지 않고 기본 브라우저로 넘긴다
 */
const guardSession = (session: Session): void => {
  if (guarded.has(session)) return
  guarded.add(session)
  session.setPermissionRequestHandler((_contents, _permission, done) => done(false))
  session.setPermissionCheckHandler(() => false)
  session.on('will-download', (event, item, contents) => {
    event.preventDefault()
    const url = item.getURL()
    // 숨은 탭의 페이지가 받는 파일은 사용자가 누른 것이 아니다 — 새 창과 같은 규칙(`handOff`)으로 버린다
    const entry = entryOfContents(contents)
    if (isWebUrl(url) && entry !== null && handOff(entry)) void shell.openExternal(url)
  })
}

const windowOf = (owner: WebContents): BrowserWindow | null => BrowserWindow.fromWebContents(owner)

/** 그 페이지의 웹 view 항목 */
const entryOfContents = (contents: WebContents): Entry | null => {
  for (const entries of owners.values()) {
    for (const entry of entries.values()) if (entry.view.webContents === contents) return entry
  }
  return null
}

const stateOf = (tabId: string, entry: Entry): WebState => {
  const contents = entry.view.webContents
  return {
    tabId,
    url: contents.getURL(),
    title: contents.getTitle(),
    loading: contents.isLoading(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    error: entry.error
  }
}

const publish = (owner: WebContents, tabId: string, entry: Entry): void => {
  if (owner.isDestroyed() || entry.view.webContents.isDestroyed()) return
  owner.send(APP_CHANNELS.webState, stateOf(tabId, entry))
}

const create = (owner: WebContents, tabId: string): Entry | null => {
  const win = windowOf(owner)
  if (!win) return null
  const view = new WebContentsView({
    webPreferences: {
      partition: WEB_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  guardSession(view.webContents.session)
  view.setVisible(false)
  win.contentView.addChildView(view)
  const entry: Entry = { view, error: null, handedOff: 0 }
  const contents = view.webContents
  const changed = (): void => publish(owner, tabId, entry)
  // 새 창은 열지 않는다 — 열려던 주소는 렌더러가 같은 창의 새 웹 탭으로 연다
  contents.setWindowOpenHandler((details) => {
    // 숨은 탭의 페이지가 여는 창은 사용자가 누른 것이 아니다. 보이는 탭도 1초에 하나만 — 탭을 마구 늘리지 않게 버린다
    if (isWebUrl(details.url) && !owner.isDestroyed() && handOff(entry)) {
      owner.send(APP_CHANNELS.webOpenRequest, details.url)
    }
    return { action: 'deny' }
  })
  // 페이지에 초점이 있어도 앱 단축키(⌘W·⌘K·⌘T…)는 앱이 받는다
  contents.on('before-input-event', (event, input) => {
    const key = webKeyOf(input, process.platform)
    if (key === null || owner.isDestroyed()) return
    event.preventDefault()
    if (key.focusApp) owner.focus()
    owner.send(APP_CHANNELS.webShortcut, { tabId, code: key.code, alt: key.alt })
  })
  // http(s) 밖으로는 가지 않는다 — file:·vault: 로 가면 보관함에 닿는다
  contents.on('will-navigate', (event) => {
    if (!isWebUrl(event.url)) event.preventDefault()
  })
  contents.on('will-redirect', (event) => {
    if (!isWebUrl(event.url)) event.preventDefault()
  })
  contents.on('did-start-loading', () => {
    entry.error = null
    changed()
  })
  contents.on('did-stop-loading', changed)
  contents.on('page-title-updated', changed)
  contents.on('did-navigate', changed)
  contents.on('did-navigate-in-page', changed)
  contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    // -3 = 사용자가 멈췄거나 다른 이동이 앞섰다 — 실패가 아니다
    if (!isMainFrame || code === -3) return
    entry.error = { kind: 'load', code, description }
    changed()
  })
  contents.on('render-process-gone', () => {
    entry.error = { kind: 'crashed' }
    changed()
  })
  entriesOf(owner).set(tabId, entry)
  const waiting = early.get(owner.id)
  if (waiting?.tabId === tabId) {
    early.delete(owner.id)
    view.setBounds(scaleRect(waiting.rect, owner.getZoomFactor()))
    view.setVisible(true)
  }
  return entry
}

const contentsOf = (owner: WebContents, tabId: string): WebContents | null => {
  const contents = owners.get(owner.id)?.get(tabId)?.view.webContents
  return contents && !contents.isDestroyed() ? contents : null
}

const destroy = (owner: WebContents, tabId: string, entry: Entry): void => {
  owners.get(owner.id)?.delete(tabId)
  const win = owner.isDestroyed() ? null : windowOf(owner)
  if (win && !win.isDestroyed()) win.contentView.removeChildView(entry.view)
  if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close()
}

const destroyAll = (owner: WebContents): void => {
  const entries = owners.get(owner.id)
  if (!entries) return
  for (const [tabId, entry] of [...entries]) destroy(owner, tabId, entry)
  owners.delete(owner.id)
  early.delete(owner.id)
}

export const webViews = {
  ensure: (owner: WebContents, tabId: string, url: string): void => {
    if (!isWebUrl(url) || owners.get(owner.id)?.has(tabId)) return
    const entry = create(owner, tabId)
    if (entry) void entry.view.webContents.loadURL(url).catch(() => {})
  },
  navigate: (owner: WebContents, tabId: string, url: string): boolean => {
    if (!isWebUrl(url)) return false
    const entry = owners.get(owner.id)?.get(tabId) ?? create(owner, tabId)
    if (!entry) return false
    // 실패는 did-fail-load 가 알린다 — loadURL 의 거절은 같은 일을 두 번 알린다
    void entry.view.webContents.loadURL(url).catch(() => {})
    return true
  },
  setBounds: (owner: WebContents, tabId: string, rect: WebRect | null): void => {
    const entries = owners.get(owner.id)
    if (rect !== null && !entries?.has(tabId)) early.set(owner.id, { tabId, rect })
    else if (rect !== null || early.get(owner.id)?.tabId === tabId) early.delete(owner.id)
    if (!entries) return
    const zoom = owner.getZoomFactor()
    for (const [id, entry] of entries) {
      if (id === tabId && rect !== null) {
        entry.view.setBounds(scaleRect(rect, zoom))
        entry.view.setVisible(true)
      } else if (id === tabId || rect !== null) {
        // 한 창에 보이는 웹 view 는 하나다 — 다른 탭의 것은 숨긴다
        entry.view.setVisible(false)
      }
    }
  },
  close: (owner: WebContents, tabId: string): void => {
    const entry = owners.get(owner.id)?.get(tabId)
    if (entry) destroy(owner, tabId, entry)
  },
  back: (owner: WebContents, tabId: string): void => {
    const history = contentsOf(owner, tabId)?.navigationHistory
    if (history?.canGoBack()) history.goBack()
  },
  forward: (owner: WebContents, tabId: string): void => {
    const history = contentsOf(owner, tabId)?.navigationHistory
    if (history?.canGoForward()) history.goForward()
  },
  /**
   * 그 탭에 지금 그려진 페이지의 html — 담기용. 격리 world 에서 읽어 페이지가 `outerHTML` 을 바꿔 둬도 원래 것을 쓴다.
   * 글자 수가 상한을 넘으면 넘기지 않는다(`too-big`)
   */
  pageHtml: async (
    owner: WebContents,
    tabId: string,
    maxChars: number
  ): Promise<{ url: string; html: string } | { failed: 'gone' | 'too-big' | 'unreadable' }> => {
    const contents = contentsOf(owner, tabId)
    if (!contents) return { failed: 'gone' }
    const url = contents.getURL()
    const code = `(() => { const h = document.documentElement.outerHTML; return h.length > ${maxChars} ? false : h })()`
    let html: unknown
    try {
      // 기다림을 끊어야 담기 단추가 풀린다
      html = await within(
        contents.executeJavaScriptInIsolatedWorld(CLIP_WORLD_ID, [{ code }]),
        CLIP_READ_MS
      )
    } catch {
      return { failed: 'unreadable' }
    }
    if (html === false) return { failed: 'too-big' }
    return typeof html === 'string' ? { url, html } : { failed: 'unreadable' }
  },
  /** 그 탭 페이지의 지금 모습(JPEG data URL) — 덮개 밑에 깔 것. 없거나 못 찍으면 null */
  capture: async (owner: WebContents, tabId: string): Promise<string | null> => {
    const contents = contentsOf(owner, tabId)
    if (!contents) return null
    try {
      const image = await within(contents.capturePage(), CAPTURE_MS)
      return image.isEmpty()
        ? null
        : `data:image/jpeg;base64,${image.toJPEG(80).toString('base64')}`
    } catch {
      return null
    }
  },
  reload: (owner: WebContents, tabId: string): void => contentsOf(owner, tabId)?.reload(),
  stop: (owner: WebContents, tabId: string): void => contentsOf(owner, tabId)?.stop()
}
