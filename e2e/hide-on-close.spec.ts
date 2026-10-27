// macOS 창 닫기 = 숨기기 — 숨긴 동안에도 앱은 열린 때와 같고, ⌘Q 는 쓰던 글을 먼저 묻는다.
import { expect, test } from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication } from '@playwright/test'
import { goTo, openDoc } from './helpers'

const visible = (app: ElectronApplication): Promise<boolean> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false)

const closeWindow = (app: ElectronApplication): Promise<void> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())

test.skip(process.platform !== 'darwin', '닫기 = 숨기기는 macOS 흐름이다')

test('닫으면 숨기고, 다시 열면 쓰던 입력이 그대로이며 숨긴 동안 바뀐 문서를 보인다', async ({
  launch
}) => {
  const { app, page, vaultDir } = await launch('hide-on-close-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/INDEX.md')
  await expect(page.getByTestId('wiki-reader')).toBeVisible()
  await page.getByTestId('chat-input').fill('보내지 않은 질문')

  await closeWindow(app)
  await expect.poll(() => visible(app)).toBe(false)
  // 앱은 살아 있다 — 창은 숨었을 뿐이다
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)

  const file = join(vaultDir, 'wiki', 'INDEX.md')
  writeFileSync(file, readFileSync(file, 'utf8') + '\n숨긴 동안 더한 줄\n')

  await app.evaluate(({ app: electronApp }) => electronApp.emit('activate'))
  await expect.poll(() => visible(app)).toBe(true)
  await expect(page.getByTestId('chat-input')).toHaveValue('보내지 않은 질문')
  await expect(page.getByTestId('wiki-reader')).toContainText('숨긴 동안 더한 줄', {
    timeout: 30_000
  })
})

test('숨긴 창에 저장 안 한 글이 있으면 종료 전에 창을 꺼내 묻고, 버리면 끝난다', async ({
  launch
}) => {
  const { app, page, vaultDir } = await launch('quit-guard-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/INDEX.md')
  await page.getByTestId('wiki-edit').click()
  await page.getByTestId('wiki-editor-source').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('\n\n저장 전 내 문장\n')

  await closeWindow(app)
  await expect.poll(() => visible(app)).toBe(false)

  // dialog 를 듣는 쪽 없이 돌리면 Playwright 1.63 이 "Page.handleJavaScriptDialog: No dialog is showing" 으로
  // 깨졌다(2026-10-02 실측) — 들어 두기만 하고 앱이 띄우는 확인 창을 본다
  page.on('dialog', () => undefined)
  // ⌘Q 와 같은 길
  await app.evaluate(({ app: electronApp }) => electronApp.quit())
  await expect.poll(() => visible(app)).toBe(true)
  await expect(page.getByTestId('wiki-discard-confirm')).toBeVisible()

  const exited = new Promise<void>((done) => app.process().once('exit', () => done()))
  await page.getByTestId('wiki-discard').click()
  await exited
  expect(readFileSync(join(vaultDir, 'wiki', 'INDEX.md'), 'utf8')).not.toContain('저장 전 내 문장')
})
