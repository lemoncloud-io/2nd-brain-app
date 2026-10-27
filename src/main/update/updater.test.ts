import { describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '../../shared/ipc-contract'
import {
  CHECK_EVERY_MS,
  pickAutoUpdater,
  FIRST_CHECK_MS,
  startUpdater,
  updateMode,
  type UpdaterDeps,
  type UpdaterPort
} from './updater'

type Listener = (arg?: unknown) => void

/** electron-updater 대신 — 이벤트를 손으로 쏜다 */
const fakePort = (): UpdaterPort & {
  emit: (event: string, arg?: unknown) => void
  checks: number
  installs: number
  onCheck: () => Promise<unknown>
} => {
  const listeners = new Map<string, Listener[]>()
  const port = {
    autoDownload: false,
    checks: 0,
    installs: 0,
    onCheck: (): Promise<unknown> => Promise.resolve(null),
    checkForUpdates(): Promise<unknown> {
      port.checks++
      return port.onCheck()
    },
    quitAndInstall(): void {
      port.installs++
    },
    on(event: string, listener: Listener): unknown {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
      return port
    },
    emit(event: string, arg?: unknown): void {
      for (const listener of listeners.get(event) ?? []) listener(arg)
    }
  }
  return port as never
}

const setup = (
  mode: UpdaterDeps['mode'],
  port = fakePort()
): {
  control: ReturnType<typeof startUpdater>
  port: ReturnType<typeof fakePort>
  load: ReturnType<typeof vi.fn>
  published: UpdateState[]
  timers: { run: () => void; ms: number }[]
} => {
  const published: UpdateState[] = []
  const timers: { run: () => void; ms: number }[] = []
  const load = vi.fn(() => Promise.resolve(port))
  const control = startUpdater({
    mode,
    load,
    publish: (state) => published.push(state),
    setTimer: (run, ms) => timers.push({ run, ms })
  })
  return { control, port, load, published, timers }
}

describe('pickAutoUpdater', () => {
  it('네이티브 import() 모양(default 안에만 있음)에서도 꺼낸다', () => {
    const updater = { name: 'au' }
    expect(pickAutoUpdater({ default: { autoUpdater: updater } })).toBe(updater)
    expect(pickAutoUpdater({ autoUpdater: updater })).toBe(updater)
  })

  it('어디에도 없으면 던진다 — undefined 로 조용히 넘어가지 않는다', () => {
    expect(() => pickAutoUpdater({ default: {} })).toThrow('autoUpdater export not found')
  })
})

describe('updateMode', () => {
  it('설치본은 빌드 상수만 본다 — env 주소는 무시한다', () => {
    expect(updateMode({ flag: false, packaged: true, feed: 'http://evil' })).toEqual({ on: false })
    expect(updateMode({ flag: true, packaged: true, feed: 'http://evil' })).toEqual({ on: true })
  })

  it('패키징 안 된 실행은 env 주소가 있을 때만 켠다', () => {
    expect(updateMode({ flag: true, packaged: false, feed: undefined })).toEqual({ on: false })
    expect(updateMode({ flag: false, packaged: false, feed: 'http://127.0.0.1:9' })).toEqual({
      on: true,
      feed: 'http://127.0.0.1:9'
    })
  })
})

describe('startUpdater', () => {
  it('꺼져 있으면 electron-updater 를 부르지도, 확인을 예약하지도 않는다', async () => {
    const { control, load, timers } = setup({ on: false })
    await control.check()
    expect(load).not.toHaveBeenCalled()
    expect(timers).toEqual([])
    expect(control.state()).toEqual({ kind: 'off' })
    expect(control.install()).toBe(false)
  })

  it('켜지면 시작 조금 뒤 확인하고, 그 뒤 주기마다 다시 확인한다', async () => {
    const { timers, port } = setup({ on: true })
    expect(timers.map((t) => t.ms)).toEqual([FIRST_CHECK_MS])
    timers[0].run()
    await vi.waitFor(() => expect(port.checks).toBe(1))
    expect(timers.map((t) => t.ms)).toEqual([FIRST_CHECK_MS, CHECK_EVERY_MS])
    expect(port.autoDownload).toBe(true)
  })

  it('새 버전을 받는 흐름이 상태로 나간다', async () => {
    const { control, port, published } = setup({ on: true })
    await control.check()
    port.emit('update-available', { version: '0.2.0' })
    port.emit('download-progress', { percent: 50 })
    port.emit('update-downloaded', { version: '0.2.0' })
    expect(published.at(-1)).toEqual({ kind: 'ready', version: '0.2.0' })
    expect(control.install()).toBe(true)
    await vi.waitFor(() => expect(port.installs).toBe(1))
  })

  it('받아 둔 뒤에는 다시 확인하지 않는다 — 같은 버전을 두 번 받지 않게', async () => {
    const { control, port } = setup({ on: true })
    await control.check()
    port.emit('update-downloaded', { version: '0.2.0' })
    await control.check()
    expect(port.checks).toBe(1)
  })

  it('겹친 확인은 한 번으로 합친다', async () => {
    const port = fakePort()
    let release: () => void = () => undefined
    port.onCheck = () => new Promise((resolve) => (release = () => resolve(null)))
    const { control } = setup({ on: true }, port)
    const first = control.check()
    const second = control.check()
    await vi.waitFor(() => expect(port.checks).toBe(1))
    release()
    await Promise.all([first, second])
    expect(port.checks).toBe(1)
  })

  it('확인이 실패하면 원문을 상태로 두고, 다음 확인에서 다시 시도한다', async () => {
    const port = fakePort()
    port.onCheck = () => Promise.reject(new Error('net::ERR_INTERNET_DISCONNECTED'))
    const { control } = setup({ on: true }, port)
    await control.check()
    expect(control.state()).toEqual({
      kind: 'failed',
      during: 'check',
      detail: 'net::ERR_INTERNET_DISCONNECTED'
    })
    port.onCheck = () => Promise.resolve(null)
    await control.check()
    expect(port.checks).toBe(2)
    expect(control.state()).toEqual({ kind: 'checking' })
  })

  it('electron-updater 를 못 불러와도 앱은 죽지 않고 실패로 남는다', async () => {
    const published: UpdateState[] = []
    const control = startUpdater({
      mode: { on: true },
      load: () => Promise.reject(new Error('app-update.yml ENOENT')),
      publish: (state) => published.push(state),
      setTimer: () => undefined
    })
    await control.check()
    expect(control.state()).toEqual({
      kind: 'failed',
      during: 'check',
      detail: 'app-update.yml ENOENT'
    })
  })

  it('불러오기가 한 번 실패해도 다음 확인에서 다시 불러온다', async () => {
    const port = fakePort()
    const load = vi
      .fn<(feed: string | undefined) => Promise<UpdaterPort>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(port)
    const control = startUpdater({
      mode: { on: true },
      load,
      publish: () => undefined,
      setTimer: () => undefined
    })
    await control.check()
    expect(control.state()).toEqual({ kind: 'failed', during: 'check', detail: 'boom' })
    await control.check()
    expect(load).toHaveBeenCalledTimes(2)
    expect(port.checks).toBe(1)
  })

  it('확인 한 번에 checking 을 한 번만 알린다', async () => {
    const { control, port, published } = setup({ on: true })
    port.onCheck = () => {
      port.emit('checking-for-update')
      return Promise.resolve(null)
    }
    await control.check()
    expect(published.filter((s) => s.kind === 'checking')).toHaveLength(1)
  })

  it('설치가 던지면 실패 상태로 알린다 — 버튼이 조용히 끝나지 않게', async () => {
    const port = fakePort()
    port.quitAndInstall = () => {
      throw new Error('EACCES')
    }
    const { control, published } = setup({ on: true }, port)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await control.check()
    port.emit('update-downloaded', { version: '0.2.0' })
    expect(control.install()).toBe(true)
    await vi.waitFor(() =>
      expect(published.at(-1)).toEqual({ kind: 'failed', during: 'install', detail: 'EACCES' })
    )
  })

  it('설치는 한 번만 부른다 — 설정 칸과 사이드바가 따로 눌러도', async () => {
    const { control, port } = setup({ on: true })
    await control.check()
    port.emit('update-downloaded', { version: '0.2.0' })
    expect(control.install()).toBe(true)
    expect(control.install()).toBe(false)
    await vi.waitFor(() => expect(port.installs).toBe(1))
  })

  it('설치 실패가 error 이벤트로 오면(win BaseUpdater·mac Squirrel) 설치 실패로 푼다', async () => {
    const { control, port, published } = setup({ on: true })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await control.check()
    port.emit('update-downloaded', { version: '0.2.0' })
    expect(control.install()).toBe(true)
    await vi.waitFor(() => expect(port.installs).toBe(1))
    port.emit('error', new Error('signature mismatch'))
    expect(published.at(-1)).toEqual({
      kind: 'failed',
      during: 'install',
      detail: 'signature mismatch'
    })
    // 받아 둔 파일로 같은 실행에서 다시 시도한다
    expect(control.install()).toBe(true)
    await vi.waitFor(() => expect(port.installs).toBe(2))
  })

  it('설치 중이 아닐 때의 error 이벤트는 확인 실패다', async () => {
    const { control, port } = setup({ on: true })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await control.check()
    port.emit('error', new Error('offline'))
    expect(control.state()).toEqual({ kind: 'failed', during: 'check', detail: 'offline' })
  })

  it('첫 확인 지연을 주입받는다 — e2e 는 바로 본다', () => {
    const timers: number[] = []
    startUpdater({
      mode: { on: true, feed: 'http://127.0.0.1:9' },
      load: () => Promise.resolve(fakePort()),
      publish: () => undefined,
      setTimer: (_run, ms) => timers.push(ms),
      firstCheckMs: 0
    })
    expect(timers).toEqual([0])
  })

  it('준비되기 전 설치 요청은 거절한다', async () => {
    const { control, port } = setup({ on: true })
    await control.check()
    expect(control.install()).toBe(false)
    expect(port.installs).toBe(0)
  })

  it('e2e 주소는 load 에 그대로 넘긴다', async () => {
    const { control, load } = setup({ on: true, feed: 'http://127.0.0.1:9' })
    await control.check()
    expect(load).toHaveBeenCalledWith('http://127.0.0.1:9')
  })
})

describe('설치와 종료', () => {
  it('설치를 부르기 전에 종료 중이라고 알린다 — 창 닫기가 숨기기로 삼키지 않게', async () => {
    const port = fakePort()
    const calls: string[] = []
    port.quitAndInstall = () => void calls.push('quitAndInstall')
    const control = startUpdater({
      mode: { on: true },
      load: () => Promise.resolve(port),
      publish: () => undefined,
      setTimer: () => undefined,
      quitting: (on) => void calls.push(on ? 'quitting' : 'canceled')
    })
    await control.check()
    port.emit('update-downloaded', { version: '0.2.0' })
    expect(control.install()).toBe(true)
    await vi.waitFor(() => expect(calls).toEqual(['quitting', 'quitAndInstall']))
  })

  it('설치 호출이 던져도 종료를 거둔다', async () => {
    const port = fakePort()
    port.quitAndInstall = () => {
      throw new Error('EACCES')
    }
    const calls: boolean[] = []
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const control = startUpdater({
      mode: { on: true },
      load: () => Promise.resolve(port),
      publish: () => undefined,
      setTimer: () => undefined,
      quitting: (on) => void calls.push(on)
    })
    await control.check()
    port.emit('update-downloaded', { version: '0.2.0' })
    control.install()
    await vi.waitFor(() => expect(calls).toEqual([true, false]))
  })

  it('설치가 실패하면 종료를 거둔다 — 창 닫기가 다시 숨긴다', async () => {
    const port = fakePort()
    const calls: boolean[] = []
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const control = startUpdater({
      mode: { on: true },
      load: () => Promise.resolve(port),
      publish: () => undefined,
      setTimer: () => undefined,
      quitting: (on) => void calls.push(on)
    })
    await control.check()
    port.emit('update-downloaded', { version: '0.2.0' })
    control.install()
    await vi.waitFor(() => expect(port.installs).toBe(1))
    port.emit('error', new Error('signature mismatch'))
    expect(calls).toEqual([true, false])
  })

  it('설치가 저장 안 한 글에 막혀 멈추면 다시 누를 수 있다', async () => {
    const port = fakePort()
    const control = startUpdater({
      mode: { on: true },
      load: () => Promise.resolve(port),
      publish: () => undefined,
      setTimer: () => undefined
    })
    await control.check()
    port.emit('update-downloaded', { version: '0.2.0' })
    expect(control.install()).toBe(true)
    await vi.waitFor(() => expect(port.installs).toBe(1))
    control.installStopped()
    expect(control.install()).toBe(true)
    await vi.waitFor(() => expect(port.installs).toBe(2))
  })
})
