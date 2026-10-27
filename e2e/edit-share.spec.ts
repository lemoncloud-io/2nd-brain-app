import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeGithub, loginAndConnect, openedUrls } from './fake-github'
import { goTo, openDoc } from './helpers'
import { tempDir } from './run-tree'

// 비개발자 왕복 — 버튼만으로: 로그인 → 연결 → 편집·저장 → 팀 새 변경 알림 → 받기(둘 다 남는다) → 팀 확인 요청(PR).
// GitHub 는 가짜 서버(API·로그인), 팀 저장소는 로컬 bare 저장소다(`fake-github.ts`).
test.slow()

const commit = (dir: string, message: string): void => {
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', message], {
    cwd: dir
  })
}

test('내 편집과 팀 새 변경을 둘 다 남기고, 버튼으로 팀 확인 요청(PR)까지 연다', async ({
  launch,
  serve
}) => {
  const github = await fakeGithub(serve)
  const shared = tempDir('share-team')
  const bare = join(shared, 'team.git')
  const mate = join(shared, 'mate')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])

  const { app, page, vaultDir } = await launch('edit-share-e2e', { env: github.env })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  await loginAndConnect(page, app, vaultDir, bare)
  execFileSync('git', ['clone', '-q', bare, mate])

  // 내가 앱에서 고치고 저장한다 — 아직 팀에는 안 올렸다
  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/INDEX.md')
  await page.getByTestId('wiki-edit').click()
  await page.getByTestId('wiki-editor-source').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('\n\n내가 앱에서 더한 문장\n')
  await page.getByTestId('wiki-save').click()
  await expect(page.getByTestId('wiki-reader')).toContainText('내가 앱에서 더한 문장')
  // 로그인한 사람이 고친 것은 그 사람의 GitHub 아이디로 남는다 — 문서 기록이 누가 고쳤는지 가른다
  expect(
    execFileSync('git', ['log', '-1', '--format=%an <%ae>', '--grep=^edit:'], {
      cwd: vaultDir,
      encoding: 'utf8'
    }).trim()
  ).toBe('alice <7+alice@users.noreply.github.com>')

  // 그 사이 동료가 팀에 올린다
  writeFileSync(join(mate, 'wiki', 'from-mate.md'), '# 동료 문서\n\n동료가 올린 문서다\n')
  commit(mate, 'mate page')
  execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: mate })

  // 창으로 돌아오면 알린다 → 한 번 눌러 받는다
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
  await page.getByTestId('sidebar-sync').click()
  // 내 편집이 이미 저장돼 갈라졌으니 합쳐서 받는다
  await expect(line).toHaveText(/팀 변경 1개를 합치기로 받았어요/, { timeout: 60_000 })
  expect(readFileSync(join(vaultDir, 'wiki', 'from-mate.md'), 'utf8')).toContain('동료가 올린')
  expect(readFileSync(join(vaultDir, 'wiki', 'INDEX.md'), 'utf8')).toContain(
    '내가 앱에서 더한 문장'
  )

  // 내 수정을 팀 확인 요청으로 — PR 이 열리고, 팀 저장소의 그 작업에는 두 쪽이 다 있다
  await expect(page.getByTestId('sidebar-share')).toContainText('팀에 확인 요청')
  await page.getByTestId('sidebar-share').click()
  await expect(page.getByTestId('sidebar-share-open')).toContainText('팀 확인 중', {
    timeout: 60_000
  })
  await expect(page.getByTestId('sidebar-share-error')).toHaveCount(0)
  expect(github.pulls).toHaveLength(1)
  const pull = github.pulls[0]!
  expect(pull.base).toBe('main')
  expect(pull.head).toMatch(/^app\/edits-\d{4}-\d{2}-\d{2}-\d{4}$/)
  expect(pull.title).toContain('wiki/INDEX.md')
  expect(pull.auth).toBe('Bearer gho_fake')
  const pushed = (file: string): string =>
    execFileSync('git', ['show', `${pull.head}:${file}`], { cwd: bare, encoding: 'utf8' })
  expect(pushed('wiki/INDEX.md')).toContain('내가 앱에서 더한 문장')
  expect(pushed('wiki/from-mate.md')).toContain('동료가 올린')
  // 팀 기본 줄기는 그대로다 — 합치기는 팀이 GitHub 에서 한다
  expect(
    execFileSync('git', ['show', 'main:wiki/INDEX.md'], { cwd: bare, encoding: 'utf8' })
  ).not.toContain('내가 앱에서 더한 문장')

  await page.getByTestId('sidebar-share-open').click()
  await expect.poll(() => openedUrls(app)).toContain('https://github.com/acme/team/pull/1')
})
