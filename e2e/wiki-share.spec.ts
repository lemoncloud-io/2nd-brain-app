import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fakeGithub, loginAndConnect, openedUrls } from './fake-github'
import { goTo } from './helpers'
import { tempDir } from './run-tree'

// 만들기 → 자료 넣기 → 위키화 → 승인 → 팀 저장소에 올리고 PR — 모두 버튼. 합치기는 팀이 GitHub 에서 한다.
test.slow()

test('승인하면 그 묶음이 팀 저장소에 올라가고 팀 확인 요청(PR)이 열린다', async ({
  launch,
  serve
}) => {
  const github = await fakeGithub(serve)
  const bare = join(tempDir('wiki-share-team'), 'team.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])

  const { app, page, root, vaultDir } = await launch('wiki-share-e2e', {
    env: { ...github.env, CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  await loginAndConnect(page, app, vaultDir, bare)

  // 자료를 넣고 위키화한다
  const clipping = join(root, 'note.md')
  writeFileSync(clipping, '# 넣은 자료\n\n본문\n')
  await goTo(page, 'sources')
  await page.getByTestId('sources-section').locator('input[type=file]').setInputFiles(clipping)
  await page.getByTestId('sources-open-ingest').click()
  await page.getByTestId('ingest-start').click()
  await expect(page.getByTestId('ingest-outcome')).toContainText('위키 초안을 마쳤어요', {
    timeout: 60_000
  })

  // 승인 — 확정하면 팀에 올라가고 요청이 열린다 (drop-page만 거절한다)
  await goTo(page, 'review')
  await page.getByTestId('review-reject-wiki/drop-page.md').click()
  await expect(page.getByTestId('review-approve-wiki/drop-page.md')).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  await page.getByTestId('review-finalize').click()
  await page.getByTestId('review-confirm-merge').click()
  await expect(page.getByTestId('review-result')).toContainText('1개 페이지가 위키에 들어갔어요', {
    timeout: 60_000
  })
  await expect(page.getByTestId('review-team')).toContainText('팀 확인 중', { timeout: 60_000 })

  expect(github.pulls).toHaveLength(1)
  const pull = github.pulls[0]!
  expect(pull.base).toBe('main')
  expect(pull.head).toMatch(/^app\/ingest-\d{4}-\d{2}-\d{2}/)
  expect(pull.title).toMatch(/^wiki: ingest-/)
  expect(pull.auth).toBe('Bearer gho_fake')
  // 팀 저장소의 그 작업에 승인한 페이지가 있고, 기본 줄기에는 아직 없다
  const show = (ref: string): string =>
    execFileSync('git', ['ls-tree', '-r', '--name-only', ref], { cwd: bare, encoding: 'utf8' })
  expect(show(pull.head)).toContain('wiki/keep-page.md')
  expect(show('main')).not.toContain('wiki/keep-page.md')

  await page.getByTestId('review-team-open').click()
  await expect.poll(() => openedUrls(app)).toContain('https://github.com/acme/team/pull/1')
})

// 혼자 쓰는 내 저장소(alice 소유, 구성원 alice 뿐) — 확인 요청 없이 기본 줄기가 바로 올라간다(첫 성공의 마지막 걸음)
test('혼자 쓰는 내 저장소면 승인하자마자 GitHub 기본 줄기에 올라가고 확인 요청은 열지 않는다', async ({
  launch,
  serve
}) => {
  const github = await fakeGithub(serve)
  const bare = join(tempDir('wiki-share-solo'), 'solo.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])

  const { app, page, root, vaultDir } = await launch('wiki-share-solo-e2e', {
    env: { ...github.env, CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  await loginAndConnect(page, app, vaultDir, bare, 'https://github.com/alice/notes.git')

  const clipping = join(root, 'note.md')
  writeFileSync(clipping, '# 넣은 자료\n\n본문\n')
  await goTo(page, 'sources')
  await page.getByTestId('sources-section').locator('input[type=file]').setInputFiles(clipping)
  await page.getByTestId('sources-open-ingest').click()
  await page.getByTestId('ingest-start').click()
  await expect(page.getByTestId('ingest-outcome')).toContainText('위키 초안을 마쳤어요', {
    timeout: 60_000
  })

  // 위키화 뒤 다른 컴퓨터에서 올린 것 — 승인 뒤 받기가 실제로 돌아야(확정 잠금 밖) 올리기가 거절되지 않는다
  const other = join(tempDir('wiki-share-solo-other'), 'other')
  execFileSync('git', ['clone', '-q', bare, other])
  writeFileSync(join(other, 'from-laptop.md'), '# 노트북에서\n')
  const inOther = (...args: string[]): void => {
    execFileSync('git', ['-c', 'user.name=a', '-c', 'user.email=a@x', ...args], { cwd: other })
  }
  inOther('add', '-A')
  inOther('commit', '-qm', 'edit: laptop')
  inOther('push', '-q', 'origin', 'HEAD:main')
  await goTo(page, 'review')
  await page.getByTestId('review-finalize').click()
  await page.getByTestId('review-confirm-merge').click()
  await expect(page.getByTestId('review-published')).toContainText('GitHub에 올렸어요', {
    timeout: 60_000
  })
  expect(github.pulls).toHaveLength(0)
  const main = execFileSync('git', ['ls-tree', '-r', '--name-only', 'main'], {
    cwd: bare,
    encoding: 'utf8'
  })
  expect(main).toContain('wiki/keep-page.md')
  expect(main).toContain('from-laptop.md')

  await page.getByTestId('review-published-open').click()
  await expect.poll(() => openedUrls(app)).toContain('https://github.com/alice/notes')
})
