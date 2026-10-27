import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeGithub, openStartTeam, signIn, TEAM_URL } from './fake-github'
import { goTo } from './helpers'
import { tempDir } from './run-tree'

// 앱을 두 번 띄운다(팀 보관함을 만드는 앱 + 어제 작업에 남은 채 여는 앱)
test.slow()

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: dir,
    encoding: 'utf8'
  }).trim()

test('어제 작업 브랜치에 남은 보관함 — 앱이 스스로 풀고 상태 줄이 사람 말로 말한다', async ({
  launch
}) => {
  const shared = tempDir('sync-line-team')
  const bare = join(shared, 'team.git')
  const mate = join(shared, 'mate')
  const userData = tempDir('sync-line-user-data')

  const first = await launch('sync-line-first-e2e', { userData })
  const vault = first.vaultDir
  await goTo(first.page, 'settings')
  await first.page.getByTestId('vault-create').click()
  await expect(first.page.getByTestId('vault-status')).toHaveText(vault)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  git(vault, 'remote', 'add', 'origin', bare)
  git(vault, 'push', '-q', '-u', 'origin', 'main')
  execFileSync('git', ['clone', '-q', bare, mate])
  await first.app.close()

  // 어제: 작업 브랜치를 따서 계획을 쓰고 PR 을 올렸다. 오늘 아침엔 저장 안 한 편집도 있다
  git(vault, 'switch', '-q', '-c', 'docs/2026-09-16-plan')
  writeFileSync(join(vault, 'wiki', 'plan.md'), '# 계획\n\n어제 쓴 계획\n')
  git(vault, 'add', '--', 'wiki/plan.md')
  git(vault, 'commit', '-qm', 'plan')
  git(vault, 'push', '-q', 'origin', 'docs/2026-09-16-plan')
  writeFileSync(join(vault, 'wiki', 'INDEX.md'), '# INDEX\n\n아침에 고친 줄\n')
  // 그사이 동료가 다른 문서를 올렸다
  writeFileSync(join(mate, 'wiki', 'from-mate.md'), '# 동료 문서\n')
  git(mate, 'add', '-A')
  git(mate, 'commit', '-qm', 'mate page')
  git(mate, 'push', '-q', 'origin', 'main')

  const { page } = await launch('sync-line-e2e', { userData, dialogDir: vault })
  const line = page.getByTestId('sidebar-sync-text')
  await expect(line).toHaveText(/팀의 최신 내용은 받아 두었어요/, { timeout: 60_000 })
  // 팀 확인 중이라는 사유는 아래 보내기 줄 한 곳에서만 말한다
  await expect(page.getByTestId('sidebar-share-held')).toContainText('팀 확인 중')
  await expect(line).not.toContainText('docs/2026-09-16-plan')
  // 작업 이름은 화면 어디에도 올리지 않는다(#64 툴팁 기술 누수 제거) — 잘린 줄을 펼쳐 보여 주는 title 도 같은 말이다
  await expect(line).toHaveAttribute('title', /팀의 최신 내용/)
  await expect(line).not.toHaveAttribute('title', /docs\/2026-09-16-plan/)
  // 팀 최신이 합쳐졌고, 아침 편집은 저장돼 남았다
  expect(git(vault, 'ls-files', 'wiki/from-mate.md')).toBe('wiki/from-mate.md')
  expect(readFileSync(join(vault, 'wiki', 'INDEX.md'), 'utf8')).toContain('아침에 고친 줄')

  // 팀이 그 PR 을 squash 로 머지했다 — 다시 받으면 기본 줄기로 돌아간다
  git(mate, 'pull', '-q', 'origin', 'main')
  writeFileSync(join(mate, 'wiki', 'plan.md'), '# 계획\n\n어제 쓴 계획\n')
  writeFileSync(join(mate, 'wiki', 'INDEX.md'), '# INDEX\n\n아침에 고친 줄\n')
  git(mate, 'add', '-A')
  git(mate, 'commit', '-qm', 'squash: plan (#7)')
  git(mate, 'push', '-q', 'origin', 'main')
  await page.getByTestId('sidebar-sync').click()
  await expect(line).toHaveText(/팀 변경 \d+개를 받았어요/, { timeout: 60_000 })
  expect(git(vault, 'branch', '--show-current')).toBe('main')
  expect(git(vault, 'branch', '--list', 'docs/2026-09-16-plan')).toContain('docs/2026-09-16-plan')
})

// 예전 앱은 브라우저 로그인(GCM)으로 올렸다 — 업데이트 뒤 첫 실행에는 앱 GitHub 로그인이 없다.
// 받으러 나가 실패하는 대신 다시 연결하라고 말하고, 누르면 설정의 GitHub 로그인으로 데려간다.
// 거기서 로그인하면 받기 줄이 돌아오고, 다른 화면의 로그인 칸도 같은 상태를 말한다
test('GitHub 저장소에 연결돼 있는데 로그인이 없으면 다시 연결하라고 말하고, 로그인하면 다시 받는다', async ({
  launch,
  serve
}) => {
  const github = await fakeGithub(serve)
  const shared = tempDir('sync-line-signed-out-team')
  const bare = join(shared, 'team.git')
  const userData = tempDir('sync-line-signed-out-user-data')
  const first = await launch('sync-line-signed-out-first-e2e', { userData })
  const vault = first.vaultDir
  await goTo(first.page, 'settings')
  await first.page.getByTestId('vault-create').click()
  await expect(first.page.getByTestId('vault-status')).toHaveText(vault)
  await first.app.close()
  // 예전에 연결해 올려 둔 보관함 — 주소는 github.com 이고 실제로는 로컬 bare 로 간다
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  git(vault, 'push', '-q', bare, 'main')
  git(vault, 'remote', 'add', 'origin', TEAM_URL)
  git(vault, 'config', `url.${bare}.insteadOf`, TEAM_URL)

  const { app, page } = await launch('sync-line-signed-out-e2e', {
    userData,
    dialogDir: vault,
    env: github.env
  })
  const line = page.getByTestId('sidebar-sync-text')
  await expect(line).toContainText('GitHub 다시 연결이 필요해요', { timeout: 60_000 })
  await expect(page.getByTestId('sidebar-sync-line')).toHaveAttribute('data-state', 'signed-out')
  await page.getByTestId('sidebar-sync').click()
  // 설정 맨 위가 아니라 GitHub 묶음으로 간다
  await expect(page.locator('#settings-github-title')).toBeFocused()
  await expect(page.locator('#settings-github')).toBeInViewport()
  await signIn(page, app)
  await expect(line).toContainText('새 팀 변경이 없어요', { timeout: 60_000 })
  // 시작하기의 로그인 칸도 같은 상태다 — 칸마다 따로 들고 있지 않다
  await page.getByTestId('reopen-start').click()
  await openStartTeam(page)
  await expect(page.getByTestId('github-login-state').filter({ visible: true })).toContainText(
    '로그인돼 있어요 (alice)'
  )
})
