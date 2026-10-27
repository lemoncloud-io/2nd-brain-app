// 앱을 띄우는 spec 은 이 `test` 를 쓴다 — 띄운 앱은 테스트가 끝날 때 자동으로 닫히고 임시 폴더도 지워진다.
//
// 왜 fixture 인가: spec 의 `try/finally` 는 단언이 깨지거나 60초 제한에 걸리면 닿지 못한다. 그러면 Electron 이
// 살아남아 다음 테스트와 메모리를 다투고(한 번 돌 때 55개를 띄운다), 볼트 사본 + userData 가 `$TMPDIR` 에 쌓인다.
// fixture 의 뒷정리는 실패·시간 초과 뒤에도 Playwright 가 부른다 — 빠뜨릴 자리가 없다.
import { test as base, expect } from '@playwright/test'
import { rmSync } from 'node:fs'
import { createServer, type RequestListener, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { launchApp, type LaunchOptions, type Launched } from './helpers'

export type LaunchFixture = (prefix: string, opts?: LaunchOptions) => Promise<Launched>
/** 로컬 웹 서버를 띄우고 그 포트를 준다 — 닫는 일은 fixture 가 한다 */
export type ServeFixture = (handler: RequestListener) => Promise<number>

export const test = base.extend<{ launch: LaunchFixture; serve: ServeFixture }>({
  // 첫 인자는 반드시 구조 분해여야 한다(Playwright 의 fixture 의존 분석) — 이 fixture 는 다른 fixture 를
  // 하나도 쓰지 않으므로 빈 패턴이다. 둘째 인자 이름은 `use` 대신 `provide` 다: `use` 로 두면 lint 가 React 훅으로 읽는다
  // eslint-disable-next-line no-empty-pattern
  launch: async ({}, provide) => {
    const started: Launched[] = []
    await provide(async (prefix, opts) => {
      const app = await launchApp(prefix, opts)
      started.push(app)
      return app
    })
    // 나중에 띄운 것부터 닫는다. 닫기가 실패해도 나머지를 마저 치운다 —
    // 여기서 던지면 정작 남은 앱과 폴더가 그대로다
    for (const { app, root } of started.reverse()) {
      await app.close().catch(() => {})
      // `force` 는 "없으면 넘어간다" 일 뿐 EBUSY·EPERM 은 던진다 — 여기서 던지면 아직 안 닫은 앱이 살아남는다
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
      } catch (error) {
        console.error(`[e2e] 임시 폴더를 지우지 못했다: ${root}`, error)
      }
    }
  },

  // 테스트가 쓰는 로컬 서버도 앱과 같은 자리에서 닫는다 — spec 의 끝줄에 두면 단언이 깨질 때 열린 채 남는다
  // eslint-disable-next-line no-empty-pattern
  serve: async ({}, provide) => {
    const servers: Server[] = []
    await provide(async (handler) => {
      const server = createServer(handler)
      servers.push(server)
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
      return (server.address() as AddressInfo).port
    })
    for (const server of servers) {
      // 앱이 아직 살아 있어 keep-alive 소켓이 열려 있을 수 있다 — 끊어 주지 않으면 close 콜백이 5초를 기다린다
      server.closeAllConnections()
      await new Promise<void>((done) => server.close(() => done()))
    }
  }
})

export { expect }
