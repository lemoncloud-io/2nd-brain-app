import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fakeGithub, signIn } from './fake-github'
import { goTo } from './helpers'
import { tempDir } from './run-tree'

// 대표가 앱에서 팀 저장소를 만들고 팀원을 초대한다 — GitHub 화면을 오가지 않는다.
// GitHub 는 가짜 서버, 만든 저장소 주소(github.com)는 보관함 git 설정 insteadOf 가 로컬 bare 로 돌린다
test.slow()

const MADE = 'https://github.com/alice/2nd-brain.git'

test('내 계정에 팀 저장소를 만들어 올리고, 있는 아이디만 초대한다', async ({ launch, serve }) => {
  const github = await fakeGithub(serve)
  const bare = join(tempDir('team-repo-made'), '2nd-brain.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])

  const { app, page, vaultDir } = await launch('team-repo-e2e', { env: github.env })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  execFileSync('git', ['config', `url.${bare}.insteadOf`, MADE], { cwd: vaultDir })

  const repo = page.getByTestId('team-repo').filter({ visible: true })
  await signIn(page, app)
  // 내가 속한 조직이 만들 곳에 보인다
  await expect(repo.getByTestId('team-repo-owner')).toContainText('acme 조직')
  await expect(repo.getByTestId('team-repo-owner')).toContainText('내 계정 (alice)')
  await repo.getByTestId('team-repo-create-start').click()

  await expect(repo).toHaveAttribute('data-state', 'connected', { timeout: 60_000 })
  await expect(repo.getByTestId('github-push-result')).toContainText('올렸어요')
  expect(github.created).toEqual([{ owner: 'alice', name: '2nd-brain', private: true }])
  expect(execFileSync('git', ['rev-parse', 'main'], { cwd: bare, encoding: 'utf8' }).trim()).toBe(
    execFileSync('git', ['rev-parse', 'main'], { cwd: vaultDir, encoding: 'utf8' }).trim()
  )

  // 없는 아이디는 GitHub 에 초대를 보내지 않는다
  const name = repo.getByTestId('team-invite-name')
  await name.fill('nobody-here')
  await repo.getByTestId('team-invite-send').click()
  await expect(repo.getByTestId('team-invite-result')).toContainText('그런 GitHub 아이디가 없어요')
  expect(github.invited).toEqual([])

  await name.fill('bob')
  await repo.getByTestId('team-invite-send').click()
  await expect(repo.getByTestId('team-invite-result')).toContainText('bob — 초대를 보냈어요')
  expect(github.invited).toEqual([{ repo: 'alice/2nd-brain', user: 'bob' }])

  await name.fill('bob')
  await repo.getByTestId('team-invite-send').click()
  await expect(repo.getByTestId('team-invite-result')).toContainText(
    '이미 이 저장소에 들어와 있어요'
  )
})

// 조직이 OAuth 앱 접근을 막아 두었다 — 일반 실패로 읽히면 대표는 무엇을 해야 하는지 모른다
test('조직이 앱을 막아 두었으면 관리자가 허용해야 한다고 말하고, 연결은 남기지 않는다', async ({
  launch,
  serve
}) => {
  const github = await fakeGithub(serve)
  const { app, page, vaultDir } = await launch('team-repo-locked-e2e', { env: github.env })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  const repo = page.getByTestId('team-repo').filter({ visible: true })
  await signIn(page, app)
  await expect(repo.getByTestId('team-repo-owner')).toContainText('locked 조직')
  await repo.getByTestId('team-repo-owner').selectOption('locked')
  await repo.getByTestId('team-repo-create-start').click()

  await expect(repo.getByTestId('team-repo-create-error')).toContainText('조직 관리자')
  await expect(repo.getByTestId('team-repo-create-link')).toHaveAttribute(
    'href',
    'https://github.com/organizations/locked/settings/oauth_application_policy'
  )
  await expect(repo).toHaveAttribute('data-state', 'none')
  expect(() =>
    execFileSync('git', ['config', '--get', 'remote.origin.url'], { cwd: vaultDir })
  ).toThrow()
  expect(github.created).toEqual([])
})

// 저장소는 생겼는데 첫 올리기가 실패했다 — 같은 이름으로 다시 만들면 이미 있다고 거절된다.
// 화면은 연결됨으로 넘어가 사유를 말하고, 지금 올리기가 다시 올린다
test('만들고 첫 올리기만 실패하면 연결됨 화면에서 다시 올린다', async ({ launch, serve }) => {
  const github = await fakeGithub(serve)
  const bare = join(tempDir('team-repo-later'), 'later.git')
  const MADE_LATER = 'https://github.com/alice/later.git'

  const { app, page, vaultDir } = await launch('team-repo-retry-e2e', { env: github.env })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  // 아직 없는 곳으로 돌린다 — 첫 올리기가 실패한다
  execFileSync('git', ['config', `url.${bare}.insteadOf`, MADE_LATER], { cwd: vaultDir })

  const repo = page.getByTestId('team-repo').filter({ visible: true })
  await signIn(page, app)
  await repo.getByTestId('team-repo-name').fill('later')
  await repo.getByTestId('team-repo-name').press('Enter')

  await expect(repo).toHaveAttribute('data-state', 'connected', { timeout: 60_000 })
  await expect(repo.getByTestId('github-push-result')).toContainText(
    '만들고 연결했지만 올리지 못했어요'
  )
  expect(github.created).toEqual([{ owner: 'alice', name: 'later', private: true }])

  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  await repo.getByTestId('github-push').click()
  await expect(repo.getByTestId('github-push-result')).toContainText('올렸어요', {
    timeout: 60_000
  })
})
