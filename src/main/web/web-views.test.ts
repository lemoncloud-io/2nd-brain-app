// web-views — 창(렌더러 webContents)별 view 관리. Electron 은 가짜로: 이벤트를 쏘면 무엇이 파기·숨김·거절되는지 본다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => {
  // vi.hoisted 안에서는 import 를 못 쓴다 — 노드 내장 EventEmitter 를 require 로
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: Emitter } = require('node:events') as typeof import('node:events')
  let nextId = 0
  class Session extends Emitter {
    permissionRequest:
      ((wc: unknown, permission: string, done: (ok: boolean) => void) => void) | null = null
    permissionCheck: (() => boolean) | null = null
    setPermissionRequestHandler(handler: Session['permissionRequest']): void {
      this.permissionRequest = handler
    }
    setPermissionCheckHandler(handler: Session['permissionCheck']): void {
      this.permissionCheck = handler
    }
  }
  const session = new Session()
  class Contents extends Emitter {
    id = ++nextId
    destroyed = false
    session = session
    send = vi.fn()
    focus = vi.fn()
    executeJavaScriptInIsolatedWorld = vi.fn((): Promise<unknown> =>
      Promise.resolve('<html></html>')
    )
    capturePage = vi.fn((): Promise<unknown> =>
      Promise.resolve({ isEmpty: () => false, toJPEG: () => Buffer.from('jpg') })
    )
    close = vi.fn(() => {
      this.destroyed = true
    })
    loadURL = vi.fn(() => Promise.resolve())
    navigationHistory = { canGoBack: () => false, canGoForward: () => false }
    isDestroyed = (): boolean => this.destroyed
    getZoomFactor = (): number => 1
    getURL = (): string => ''
    getTitle = (): string => ''
    isLoading = (): boolean => false
    setWindowOpenHandler = vi.fn()
  }
  class View {
    webContents = new Contents()
    visible = true
    bounds: unknown = null
    setVisible(visible: boolean): void {
      this.visible = visible
    }
    getVisible(): boolean {
      return this.visible
    }
    setBounds(bounds: unknown): void {
      this.bounds = bounds
    }
  }
  const windows = new Map<number, { contentView: { children: View[] } }>()
  const windowFor = (owner: { id: number }): { contentView: { children: View[] } } => {
    let win = windows.get(owner.id)
    if (!win) {
      win = { contentView: { children: [] } }
      windows.set(owner.id, win)
    }
    return win
  }
  return { Contents, View, session, windowFor, openExternal: vi.fn() }
})

vi.mock('electron', () => ({
  WebContentsView: fake.View,
  BrowserWindow: {
    fromWebContents: (owner: { id: number }) => {
      const win = fake.windowFor(owner)
      return {
        isDestroyed: () => false,
        contentView: {
          addChildView: (view: InstanceType<typeof fake.View>) =>
            win.contentView.children.push(view),
          removeChildView: (view: InstanceType<typeof fake.View>) => {
            win.contentView.children = win.contentView.children.filter((child) => child !== view)
          }
        }
      }
    }
  },
  shell: { openExternal: fake.openExternal }
}))

const { webViews } = await import('./web-views')

type Owner = InstanceType<typeof fake.Contents>
const owner = (): Owner => new fake.Contents()
const viewsOf = (o: Owner): InstanceType<typeof fake.View>[] =>
  fake.windowFor(o).contentView.children
// webViews 는 Electron 의 WebContents 를 받는다 — 가짜는 쓰는 칸만 있다
const asOwner = (o: Owner): Electron.WebContents => o as unknown as Electron.WebContents
const URL_A = 'https://a.example/'

beforeEach(() => {
  fake.openExternal.mockClear()
})

describe('창 렌더러가 다시 불러오면', () => {
  it('그 창의 웹 view 를 전부 파기한다 — 탭 상태가 사라져 고아가 된다', () => {
    const o = owner()
    webViews.navigate(asOwner(o), 'tab-1', URL_A)
    webViews.navigate(asOwner(o), 'tab-2', URL_A)
    const [one, two] = viewsOf(o)
    o.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    expect(viewsOf(o)).toEqual([])
    expect(one.webContents.close).toHaveBeenCalled()
    expect(two.webContents.close).toHaveBeenCalled()
  })

  it('같은 문서 안 이동(#)은 파기하지 않는다', () => {
    const o = owner()
    webViews.navigate(asOwner(o), 'tab-1', URL_A)
    o.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    expect(viewsOf(o)).toHaveLength(1)
  })

  it('다시 불러올 때마다 감시를 더 붙이지 않는다', () => {
    const o = owner()
    for (let i = 0; i < 3; i += 1) {
      webViews.navigate(asOwner(o), 'tab-1', URL_A)
      o.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    }
    expect(o.listenerCount('did-start-navigation')).toBe(1)
    expect(o.listenerCount('destroyed')).toBe(1)
  })

  it('렌더러 프로세스가 죽어도 파기한다', () => {
    const o = owner()
    webViews.navigate(asOwner(o), 'tab-1', URL_A)
    o.emit('render-process-gone')
    expect(viewsOf(o)).toEqual([])
  })
})

describe('view 보다 먼저 온 자리', () => {
  it('만들기 전에 받은 사각형을 만들 때 쓴다 — 렌더러는 자리를 먼저 보낸다', () => {
    const o = owner()
    webViews.setBounds(asOwner(o), 'tab-1', { x: 0, y: 36, width: 800, height: 600 })
    webViews.ensure(asOwner(o), 'tab-1', URL_A)
    const [view] = viewsOf(o)
    expect(view.visible).toBe(true)
    expect(view.bounds).toEqual({ x: 0, y: 36, width: 800, height: 600 })
  })

  it('그 사이 숨기라고 했거나 다른 탭이 자리를 받았으면 쓰지 않는다', () => {
    const o = owner()
    webViews.setBounds(asOwner(o), 'tab-1', { x: 0, y: 36, width: 800, height: 600 })
    webViews.setBounds(asOwner(o), 'tab-1', null)
    webViews.ensure(asOwner(o), 'tab-1', URL_A)
    expect(viewsOf(o)[0].visible).toBe(false)

    webViews.setBounds(asOwner(o), 'tab-2', { x: 0, y: 36, width: 800, height: 600 })
    webViews.setBounds(asOwner(o), 'tab-1', { x: 0, y: 36, width: 800, height: 600 })
    webViews.ensure(asOwner(o), 'tab-2', URL_A)
    expect(viewsOf(o)[1].visible).toBe(false)
  })
})

describe('창 격리', () => {
  it('다른 창이 같은 탭 id 로 보낸 명령은 이 창의 view 를 건드리지 않는다', () => {
    const a = owner()
    const b = owner()
    webViews.navigate(asOwner(a), 'tab-1', URL_A)
    webViews.setBounds(asOwner(a), 'tab-1', { x: 0, y: 36, width: 800, height: 600 })
    const [view] = viewsOf(a)
    webViews.setBounds(asOwner(b), 'tab-1', null)
    webViews.close(asOwner(b), 'tab-1')
    expect(view.visible).toBe(true)
    expect(view.webContents.close).not.toHaveBeenCalled()
  })
})

describe('페이지가 연 것', () => {
  it('새 창은 거절하고 http(s) 주소만 그 창 렌더러에 새 웹 탭으로 청한다', () => {
    const o = owner()
    webViews.navigate(asOwner(o), 'tab-1', URL_A)
    webViews.setBounds(asOwner(o), 'tab-1', { x: 0, y: 36, width: 800, height: 600 })
    const [view] = viewsOf(o)
    const open = view.webContents.setWindowOpenHandler.mock.calls[0][0] as (details: {
      url: string
    }) => { action: string }
    expect(open({ url: 'https://b.example/' })).toEqual({ action: 'deny' })
    expect(open({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' })
    expect(o.send).toHaveBeenCalledWith('web:open-request', 'https://b.example/')
    expect(o.send).not.toHaveBeenCalledWith('web:open-request', 'file:///etc/passwd')

    // 숨은 탭의 페이지가 여는 창은 탭으로 만들지 않는다
    o.send.mockClear()
    view.setVisible(false)
    expect(open({ url: 'https://c.example/' })).toEqual({ action: 'deny' })
    expect(o.send).not.toHaveBeenCalled()
  })

  it('보이는 탭도 1초에 하나만 넘긴다 — 페이지가 되풀이해 열어도 탭·브라우저가 쏟아지지 않는다', () => {
    vi.useFakeTimers()
    try {
      const o = owner()
      webViews.navigate(asOwner(o), 'tab-1', URL_A)
      webViews.setBounds(asOwner(o), 'tab-1', { x: 0, y: 36, width: 800, height: 600 })
      const [view] = viewsOf(o)
      const open = view.webContents.setWindowOpenHandler.mock.calls[0][0] as (details: {
        url: string
      }) => { action: string }
      const item = { getURL: () => 'https://a.example/file.zip' }
      open({ url: 'https://b.example/' })
      open({ url: 'https://c.example/' })
      fake.session.emit('will-download', { preventDefault: vi.fn() }, item, view.webContents)
      expect(o.send.mock.calls.filter(([channel]) => channel === 'web:open-request')).toHaveLength(
        1
      )
      expect(fake.openExternal).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1_000)
      fake.session.emit('will-download', { preventDefault: vi.fn() }, item, view.webContents)
      expect(fake.openExternal).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('http(s) 밖으로 가는 이동·되돌림은 막는다', () => {
    const o = owner()
    webViews.navigate(asOwner(o), 'tab-1', URL_A)
    const [view] = viewsOf(o)
    for (const name of ['will-navigate', 'will-redirect']) {
      const blocked = { url: 'file:///x', preventDefault: vi.fn() }
      const allowed = { url: 'https://x.example/', preventDefault: vi.fn() }
      view.webContents.emit(name, blocked)
      view.webContents.emit(name, allowed)
      expect(blocked.preventDefault).toHaveBeenCalled()
      expect(allowed.preventDefault).not.toHaveBeenCalled()
    }
  })

  it('페이지 프로세스가 죽으면 멈춤을 알리고, 다시 불러오기 시작하면 지운다', () => {
    const o = owner()
    webViews.navigate(asOwner(o), 'tab-1', URL_A)
    const [view] = viewsOf(o)
    view.webContents.emit('render-process-gone')
    expect(o.send).toHaveBeenLastCalledWith(
      'web:state',
      expect.objectContaining({ tabId: 'tab-1', error: { kind: 'crashed' } })
    )
    view.webContents.emit('did-start-loading')
    expect(o.send).toHaveBeenLastCalledWith(
      'web:state',
      expect.objectContaining({ tabId: 'tab-1', error: null })
    )
    // 창이 아니라 페이지가 죽었다 — view 는 그대로다
    expect(viewsOf(o)).toHaveLength(1)
  })

  it('페이지 초점에서 ⌘W 는 페이지에 닿지 않고 앱에 탭 닫기로 간다', () => {
    const o = owner()
    webViews.navigate(asOwner(o), 'tab-1', URL_A)
    const [view] = viewsOf(o)
    const event = { preventDefault: vi.fn() }
    const input = {
      type: 'keyDown',
      code: 'KeyW',
      meta: process.platform === 'darwin',
      control: process.platform !== 'darwin',
      alt: false,
      shift: false,
      isAutoRepeat: false
    }
    view.webContents.emit('before-input-event', event, input)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(o.focus).toHaveBeenCalled()
    expect(o.send).toHaveBeenCalledWith('web:shortcut', {
      tabId: 'tab-1',
      code: 'KeyW',
      alt: false
    })

    // 복사는 페이지 몫
    const copy = { preventDefault: vi.fn() }
    view.webContents.emit('before-input-event', copy, { ...input, code: 'KeyC' })
    expect(copy.preventDefault).not.toHaveBeenCalled()
  })
})

describe('pageHtml — 담기가 읽는 페이지', () => {
  it('페이지 world(0)가 아닌 격리 world 에서 읽고, 글자 수 상한을 코드에 싣는다', async () => {
    const o = owner()
    webViews.navigate(asOwner(o), 'tab-1', URL_A)
    const [view] = viewsOf(o)
    expect(await webViews.pageHtml(asOwner(o), 'tab-1', 1234)).toEqual({
      url: '',
      html: '<html></html>'
    })
    const [world, scripts] = view.webContents.executeJavaScriptInIsolatedWorld.mock
      .calls[0] as unknown as [number, { code: string }[]]
    expect(world).not.toBe(0)
    expect(scripts[0].code).toContain('1234')
  })

  it('상한을 넘으면 too-big, 문자열이 아니거나 읽다 죽으면 unreadable, 없는 탭이면 gone', async () => {
    const o = owner()
    webViews.navigate(asOwner(o), 'tab-1', URL_A)
    const [view] = viewsOf(o)
    const read = view.webContents.executeJavaScriptInIsolatedWorld
    read.mockResolvedValueOnce(false)
    expect(await webViews.pageHtml(asOwner(o), 'tab-1', 10)).toEqual({ failed: 'too-big' })
    read.mockResolvedValueOnce({ toString: () => 'x' })
    expect(await webViews.pageHtml(asOwner(o), 'tab-1', 10)).toEqual({ failed: 'unreadable' })
    read.mockRejectedValueOnce(new Error('gone'))
    expect(await webViews.pageHtml(asOwner(o), 'tab-1', 10)).toEqual({ failed: 'unreadable' })
    expect(await webViews.pageHtml(asOwner(o), 'tab-9', 10)).toEqual({ failed: 'gone' })
  })

  it('멈춘 페이지가 답하지 않으면 15초 뒤 unreadable 로 끊는다', async () => {
    vi.useFakeTimers()
    try {
      const o = owner()
      webViews.navigate(asOwner(o), 'tab-1', URL_A)
      const [view] = viewsOf(o)
      view.webContents.executeJavaScriptInIsolatedWorld.mockReturnValueOnce(new Promise(() => {}))
      const reading = webViews.pageHtml(asOwner(o), 'tab-1', 10)
      await vi.advanceTimersByTimeAsync(15_000)
      expect(await reading).toEqual({ failed: 'unreadable' })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('capture — 덮개 밑에 깔 페이지 모습', () => {
  it('JPEG data URL 을 준다', async () => {
    const o = owner()
    webViews.navigate(asOwner(o), 'tab-1', URL_A)
    expect(await webViews.capture(asOwner(o), 'tab-1')).toBe(
      `data:image/jpeg;base64,${Buffer.from('jpg').toString('base64')}`
    )
  })

  it('빈 그림·찍다 실패·없는 탭이면 null — 덮개는 빈 자리로 둔다', async () => {
    const o = owner()
    webViews.navigate(asOwner(o), 'tab-1', URL_A)
    const shoot = viewsOf(o)[0].webContents.capturePage
    shoot.mockResolvedValueOnce({ isEmpty: () => true, toJPEG: () => Buffer.from('') })
    expect(await webViews.capture(asOwner(o), 'tab-1')).toBeNull()
    shoot.mockRejectedValueOnce(new Error('crashed'))
    expect(await webViews.capture(asOwner(o), 'tab-1')).toBeNull()
    expect(await webViews.capture(asOwner(o), 'tab-9')).toBeNull()
  })

  it('멈춘 페이지가 답하지 않으면 1초 뒤 null — 팔레트가 view 밑에 오래 깔리지 않는다', async () => {
    vi.useFakeTimers()
    try {
      const o = owner()
      webViews.navigate(asOwner(o), 'tab-1', URL_A)
      viewsOf(o)[0].webContents.capturePage.mockReturnValueOnce(new Promise(() => {}))
      const shooting = webViews.capture(asOwner(o), 'tab-1')
      await vi.advanceTimersByTimeAsync(1_000)
      expect(await shooting).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('웹 저장 구역 정책', () => {
  it('권한 요청(위치·알림·카메라)은 묻지 않고 거절한다', () => {
    webViews.navigate(asOwner(owner()), 'tab-1', URL_A)
    const done = vi.fn()
    fake.session.permissionRequest?.(null, 'geolocation', done)
    expect(done).toHaveBeenCalledWith(false)
    expect(fake.session.permissionCheck?.()).toBe(false)
  })

  it('파일 받기는 취소하고 기본 브라우저로 넘긴다 — 보이는 탭의 페이지가 받을 때만', () => {
    const o = owner()
    webViews.navigate(asOwner(o), 'tab-1', URL_A)
    webViews.setBounds(asOwner(o), 'tab-1', { x: 0, y: 36, width: 800, height: 600 })
    const [view] = viewsOf(o)
    const item = { getURL: () => 'https://a.example/file.zip' }
    const event = { preventDefault: vi.fn() }
    fake.session.emit('will-download', event, item, view.webContents)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(fake.openExternal).toHaveBeenCalledWith('https://a.example/file.zip')

    // 숨은 탭의 페이지가 되풀이해 받아도 브라우저를 띄우지 않는다
    fake.openExternal.mockClear()
    view.setVisible(false)
    const hidden = { preventDefault: vi.fn() }
    fake.session.emit('will-download', hidden, item, view.webContents)
    expect(hidden.preventDefault).toHaveBeenCalled()
    expect(fake.openExternal).not.toHaveBeenCalled()
  })
})
