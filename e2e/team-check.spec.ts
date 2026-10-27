import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo } from './helpers'
import { tempDir } from './run-tree'

test.slow()

const commit = (dir: string, message: string): void => {
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', message], {
    cwd: dir
  })
}

test('팀에 새 변경이 올라오면 상태 줄이 알리고, 한 번 눌러 받아도 내 작업은 남는다', async ({
  launch
}) => {
  const shared = tempDir('look-team')
  const bare = join(shared, 'team.git')
  const mate = join(shared, 'mate')

  const { app, page, vaultDir } = await launch('team-check-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: vaultDir })
  execFileSync('git', ['push', '-q', '-u', 'origin', 'main'], { cwd: vaultDir })
  execFileSync('git', ['clone', '-q', bare, mate])

  // 앱이 켜져 있는 동안 동료가 올리고, 나는 아직 저장 안 한 편집을 들고 있다
  writeFileSync(join(mate, 'wiki', 'from-mate.md'), '# 동료 문서\n\n동료가 올린 문서다\n')
  commit(mate, 'mate page')
  execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: mate })
  const index = join(vaultDir, 'wiki', 'INDEX.md')
  writeFileSync(index, '# 내가 고친 안내\n\n아직 안 올린 내 문장\n')

  // 창이 앞으로 오면 살펴본다 — 알리기만 하고 받지는 않는다
  const line = page.getByTestId('sidebar-sync-text')
  await expect
    .poll(
      async () => {
        // 핸들러는 앞에 온 창의 보관함을 본다 — 창 없이 보내면 그냥 돌아간다
        await app.evaluate(({ app: electronApp, BrowserWindow }) => {
          electronApp.emit('browser-window-focus', {}, BrowserWindow.getAllWindows()[0])
        })
        return line.textContent()
      },
      { timeout: 60_000, intervals: [1_000, 5_000, 16_000] }
    )
    .toMatch(/팀에 새 변경 1개/)
  await expect(page.getByTestId('sidebar-sync-line')).toHaveAttribute('data-state', 'waiting')
  expect(existsSync(join(vaultDir, 'wiki', 'from-mate.md'))).toBe(false)

  // 한 번 누르면 받는다 — 팀 문서가 들어오고 내 편집은 그대로다
  await expect(page.getByTestId('sidebar-sync')).toHaveText('받기')
  await page.getByTestId('sidebar-sync').click()
  // 내 편집이 먼저 저장돼 갈라졌으니 앞으로 감기가 아니라 합쳐서 받는다
  await expect(line).toHaveText(/팀 변경 1개를 합치기로 받았어요/, { timeout: 60_000 })
  await expect(page.getByTestId('sidebar-sync-line')).toHaveAttribute('data-state', 'idle')
  expect(readFileSync(join(vaultDir, 'wiki', 'from-mate.md'), 'utf8')).toContain('동료가 올린')
  expect(readFileSync(index, 'utf8')).toContain('아직 안 올린 내 문장')
  // 내 편집은 저장돼 다음 올리기에 실린다
  await expect(line).toContainText(/안 올린 작업 \d+개/)
  expect(
    execFileSync('git', ['log', '--format=%s', '-3'], { cwd: vaultDir, encoding: 'utf8' })
  ).toMatch(/^save: /m)
})
