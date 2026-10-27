// 앱 밖에서 새로 만든 문서는 저절로 팀에 가지 않는다 — 사람이 "함께 보내기" 를 고를 때만 확인 요청에 실린다.
// 같은 문서를 둘이 고친 상태에서는 상태 줄을 누르면 받기 대신 고르는 곳으로 간다.
import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeGithub, loginAndConnect } from './fake-github'
import { goTo } from './helpers'
import { tempDir } from './run-tree'

test.slow()

const commit = (dir: string, message: string): void => {
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', message], {
    cwd: dir
  })
}

test('앱 밖 새 문서는 골라야 확인 요청에 실린다', async ({ launch, serve }) => {
  const github = await fakeGithub(serve)
  const bare = join(tempDir('share-new-team'), 'team.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  const { app, page, vaultDir } = await launch('share-new-e2e', { env: github.env })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  await loginAndConnect(page, app, vaultDir, bare)

  // Obsidian 에서 새 문서를 만들었다 — 앱은 아직 모른다
  writeFileSync(join(vaultDir, 'wiki', 'from-obsidian.md'), '# 밖에서 만든 문서\n')
  await expect
    .poll(
      async () => {
        // 핸들러는 앞에 온 창의 보관함을 본다 — 창 없이 보내면 그냥 돌아간다
        await app.evaluate(({ app: electronApp, BrowserWindow }) => {
          electronApp.emit('browser-window-focus', {}, BrowserWindow.getAllWindows()[0])
        })
        return page.getByTestId('sidebar-share-new').count()
      },
      { timeout: 60_000, intervals: [1_000, 5_000, 16_000] }
    )
    .toBe(1)
  await expect(page.getByTestId('sidebar-share-new')).toContainText('새로 만든 문서 1개')
  // 고르기 전에는 보낼 것이 없다
  await expect(page.getByTestId('sidebar-share')).toBeDisabled()

  await page.getByTestId('sidebar-share-new').locator('input').check()
  await expect(page.getByTestId('sidebar-share')).toContainText('고친 문서 1개 · 팀에 확인 요청')
  await page.getByTestId('sidebar-share').click()
  await expect(page.getByTestId('sidebar-share-open')).toContainText('팀 확인 중', {
    timeout: 60_000
  })
  expect(github.pulls).toHaveLength(1)
  expect(
    execFileSync('git', ['show', `${github.pulls[0]!.head}:wiki/from-obsidian.md`], {
      cwd: bare,
      encoding: 'utf8'
    })
  ).toContain('밖에서 만든 문서')
  await expect(page.getByTestId('sidebar-share-new')).toHaveCount(0)
})

test('같은 문서를 둘이 고쳤으면 상태 줄이 두 줄까지 보이고, 누르면 고르는 곳으로 간다', async ({
  launch
}) => {
  const shared = tempDir('pick-team')
  const bare = join(shared, 'team.git')
  const mate = join(shared, 'mate')
  const first = await launch('pick-first-e2e')
  const vaultDir = first.vaultDir
  await goTo(first.page, 'settings')
  await first.page.getByTestId('vault-create').click()
  await expect(first.page.getByTestId('vault-status')).toHaveText(vaultDir)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: vaultDir })
  execFileSync('git', ['push', '-q', '-u', 'origin', 'main'], { cwd: vaultDir })
  execFileSync('git', ['clone', '-q', bare, mate])
  writeFileSync(join(mate, 'wiki', 'INDEX.md'), '# 팀\n')
  commit(mate, 'mate')
  execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: mate })
  writeFileSync(join(vaultDir, 'wiki', 'INDEX.md'), '# 나\n')
  commit(vaultDir, 'mine')

  const { page } = first
  // 팀 저장소는 앱 밖에서 붙였다 — 다시 세면 "연결하기" 대신 받기 단추가 된다(살펴본 뒤면 "받기")
  await expect(page.getByTestId('sidebar-sync')).toHaveText(/^(받기|다시 확인)$/)
  await page.getByTestId('sidebar-sync').click()
  const text = page.getByTestId('sidebar-sync-text')
  await expect(text).toContainText('나와 팀이 따로 고친 문서 1개', {
    timeout: 60_000
  })
  // 할 일이 잘리지 않는다 — 한 줄 높이를 넘어 두 줄로 보인다
  const box = await text.boundingBox()
  const lineHeight = await text.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
  expect(box!.height).toBeGreaterThan(lineHeight * 1.5)

  await page.getByTestId('sidebar-sync').click()
  await expect(page.getByTestId('conflict-picker')).toBeVisible()
})
