import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // `*.spec.ts` 만 Playwright 몫이다 — 같은 폴더의 `*.test.ts`(순수 함수)는 vitest 가 돌린다
  testMatch: '**/*.spec.ts',
  // 임시 폴더는 실행마다 한 그루 — 끝나면 통째로 지운다(e2e/run-tree.ts)
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  outputDir: './test-results',
  timeout: 60000,
  // 부하 높은 머신에서 3D·스트리밍 spec 이 흔들린다 — CI에서만 한 번 더 본다.
  // CI 명령(`playwright test --retries 1`)과 같은 값이다: 둘 중 하나만 바꿔도 어긋나니 함께 본다
  retries: process.env['CI'] ? 1 : 0,
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
})
