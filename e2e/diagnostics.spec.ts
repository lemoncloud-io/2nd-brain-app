import { expect, test } from './fixtures'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { goTo, openAdvancedSettings } from './helpers'
import { tempDir } from './run-tree'

// 배포본 진단 — 오류·크래시가 userData/logs 에 남고, 비밀은 가려진다.
// 모달 오류 상자는 e2e 를 멈추므로 main 에서 먼저 고정한다(로거는 부를 때 속성을 읽는다)

const FAKE_TOKEN = 'ghp_e2eFakeToken0123456789abcdefghijkl'

const mainLog = (userData: string): string => {
  const file = join(userData, 'logs', 'main.log')
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

test('main log: main 오류와 uncaught 예외가 가린 채 main.log 에 남는다', async ({ launch }) => {
  const { app, page, userData } = await launch('diag-main')
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ dialog }, token) => {
    Object.assign(dialog, { showErrorBox: () => {} })
    console.error('github call failed', `Bearer ${token}`)
    setTimeout(() => {
      throw new Error('e2e uncaught boom')
    }, 0)
  }, FAKE_TOKEN)

  // 일반 줄은 다음 틱에 묶어 쓴다 — 두 줄 다 닿을 때까지 기다린다
  await expect.poll(() => mainLog(userData)).toContain('e2e uncaught boom')
  await expect.poll(() => mainLog(userData)).toContain('github call failed')
  const log = mainLog(userData)
  expect(log).toMatch(/\[info\] \[main\] start 2nd-brain/)
  expect(log).toMatch(/\[error\] \[console\] github call failed Bearer \[REDACTED\]/)
  expect(log).toMatch(/\[fatal\] \[main\] uncaughtException Error: e2e uncaught boom/)
  expect(log).not.toContain(FAKE_TOKEN)
  // 앱은 살아 있다 — 창이 그대로 응답한다
  await expect(page.locator('body')).toBeVisible()
})

test('renderer: 렌더러 오류·거부가 가린 채 main.log 에 남는다', async ({ launch }) => {
  const { page, userData } = await launch('diag-renderer')
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate((token) => {
    setTimeout(() => {
      throw new Error(`e2e window boom ${token}`)
    }, 0)
    void Promise.reject(new Error('e2e rejected promise'))
  }, FAKE_TOKEN)
  await expect.poll(() => mainLog(userData)).toMatch(/\[error\] \[renderer\] .*e2e window boom/)
  await expect
    .poll(() => mainLog(userData))
    .toMatch(/\[error\] \[renderer\] .*e2e rejected promise/)
  expect(mainLog(userData)).not.toContain(FAKE_TOKEN)
})

test('renderer: 앱 창 화면이 죽으면 대화상자로 다시 열고 기록을 남긴다', async ({ launch }) => {
  const { app, page, userData } = await launch('diag-renderer-gone')
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ dialog, BrowserWindow }) => {
    const g = globalThis as { dialogCalls?: string[] }
    g.dialogCalls = []
    Object.assign(dialog, {
      showMessageBox: async (_win: unknown, opts: { message: string }) => {
        g.dialogCalls?.push(opts.message)
        return { response: 0, checkboxChecked: false }
      }
    })
    BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer()
  })
  await expect
    .poll(() => mainLog(userData))
    .toMatch(/\[error\] \[main\] render-process-gone (crashed|killed)/)
  await expect
    .poll(() => app.evaluate(() => (globalThis as { dialogCalls?: string[] }).dialogCalls?.length))
    .toBe(1)
  // 다시 열기 — 창은 같은 창이고 화면이 다시 산다
  await expect.poll(() => mainLog(userData)).toContain('render-process-gone choice 0')
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => {
        const contents = BrowserWindow.getAllWindows()[0].webContents
        return !contents.isCrashed() && !contents.isLoading()
      })
    )
    .toBe(true)
})

test('export: 설정 > 고급 > 문제 해결에서 진단 정보를 zip 으로 내보내고 기록 폴더를 연다', async ({
  launch
}) => {
  const { app, page } = await launch('diag-export')
  const target = join(tempDir('diag-export-out'), 'diagnostics.zip')
  await app.evaluate(
    ({ dialog, shell }, { token, target }) => {
      const g = globalThis as { opened?: string[] }
      g.opened = []
      Object.assign(dialog, {
        showSaveDialog: async () => ({ canceled: false, filePath: target })
      })
      Object.assign(shell, {
        openPath: async (dir: string) => {
          g.opened?.push(dir)
          return ''
        }
      })
      console.error('export check', `Bearer ${token}`)
    },
    { token: FAKE_TOKEN, target }
  )
  await goTo(page, 'settings')
  await openAdvancedSettings(page)

  await page.getByTestId('diagnostics-export').click()
  await expect(page.getByTestId('diagnostics-note')).not.toBeEmpty()
  const files = unzipSync(readFileSync(target))
  expect(Object.keys(files)).toEqual(expect.arrayContaining(['main.log', 'diagnostics.json']))
  const log = strFromU8(files['main.log'])
  expect(log).toContain('export check Bearer [REDACTED]')
  expect(log).not.toContain(FAKE_TOKEN)
  const info = JSON.parse(strFromU8(files['diagnostics.json']))
  expect(info.app.version).toMatch(/\d+\.\d+\.\d+/)
  expect(info.settings.hasVault).toBe(false)

  await page.getByTestId('diagnostics-open-logs').click()
  await expect
    .poll(() => app.evaluate(() => (globalThis as { opened?: string[] }).opened ?? []))
    .toEqual([expect.stringMatching(/logs$/)])
})

test('export: 앱 창 화면이 죽은 대화상자에서 진단 정보를 내보내고 창을 다시 연다', async ({
  launch
}) => {
  const { app, page, userData } = await launch('diag-export-gone')
  await page.waitForLoadState('domcontentloaded')
  const target = join(tempDir('diag-export-gone-out'), 'diagnostics.zip')
  await app.evaluate(({ dialog, BrowserWindow }, target) => {
    Object.assign(dialog, {
      showMessageBox: async () => ({ response: 1, checkboxChecked: false }),
      showSaveDialog: async () => ({ canceled: false, filePath: target })
    })
    BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer()
  }, target)
  await expect.poll(() => mainLog(userData)).toContain('render-process-gone choice 1')
  await expect.poll(() => existsSync(target)).toBe(true)
  expect(Object.keys(unzipSync(readFileSync(target)))).toContain('diagnostics.json')
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => {
        const contents = BrowserWindow.getAllWindows()[0].webContents
        return !contents.isCrashed() && !contents.isLoading()
      })
    )
    .toBe(true)
})

test('developer mode: 켜면 프로세스 표·성능 기록이 보이고, 기록을 멈추면 trace 파일이 남는다', async ({
  launch
}) => {
  const { app, page, userData } = await launch('diag-devmode')
  await goTo(page, 'settings')
  await openAdvancedSettings(page)
  // 꺼져 있으면 main 이 개발자 손잡이를 거절한다 — 화면 숨김만 믿지 않는다
  await expect(
    page.evaluate(() =>
      (
        window as unknown as { api: { getProcessMetrics(): Promise<unknown> } }
      ).api.getProcessMetrics()
    )
  ).rejects.toThrow()
  await expect(page.getByTestId('diagnostics-metrics')).toHaveCount(0)

  // 켜기 전에 main 이 묻는다 — 취소하면 꺼진 채로 남는다
  const answer = (response: number): Promise<void> =>
    app.evaluate(({ dialog }, response) => {
      Object.assign(dialog, {
        showMessageBox: async () => ({ response, checkboxChecked: false })
      })
    }, response)
  await answer(1)
  await page.getByTestId('diagnostics-developer-mode').click()
  await expect(page.getByTestId('diagnostics-developer-mode')).toBeEnabled()
  await expect(page.getByTestId('diagnostics-developer-mode')).toHaveAttribute(
    'aria-checked',
    'false'
  )
  await answer(0)
  await page.getByTestId('diagnostics-developer-mode').click()
  await expect(page.getByTestId('diagnostics-metrics')).toBeVisible()
  await expect(page.getByTestId('diagnostics-metrics').locator('tbody tr').first()).toBeVisible()
  const saved = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
  expect(saved.developerMode).toBe(true)

  await page.getByTestId('diagnostics-trace-start').click()
  await expect(page.getByTestId('diagnostics-trace-stop')).toBeVisible()
  await page.getByTestId('diagnostics-trace-stop').click()
  await expect(page.getByTestId('diagnostics-trace-note')).not.toBeEmpty()
  await expect
    .poll(() => readdirSync(join(userData, 'logs')).filter((f) => /^trace-.*\.json$/.test(f)))
    .toHaveLength(1)
  await expect(page.getByTestId('diagnostics-trace-start')).toBeVisible()

  // 기록 중에 끄면 main 이 기록을 닫아 파일로 남기고, 꺼진 채 기록이 돌지 않는다
  await page.getByTestId('diagnostics-trace-start').click()
  await expect(page.getByTestId('diagnostics-trace-stop')).toBeVisible()
  await page.getByTestId('diagnostics-developer-mode').click()
  await expect(page.getByTestId('diagnostics-metrics')).toHaveCount(0)
  await expect
    .poll(() => readdirSync(join(userData, 'logs')).filter((f) => /^trace-.*\.json$/.test(f)))
    .toHaveLength(2)
  await expect(page.getByTestId('diagnostics-trace-note')).not.toBeEmpty()
  const state = await page.evaluate(() =>
    (
      window as unknown as { api: { getDiagnosticsState(): Promise<unknown> } }
    ).api.getDiagnosticsState()
  )
  expect(state).toEqual({ developerMode: false, traceStartedAt: null })
})
