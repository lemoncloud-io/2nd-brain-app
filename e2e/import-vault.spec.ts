import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeGithub, signIn } from './fake-github'
import { goTo, openDoc } from './helpers'
import { tempDir } from './run-tree'

// 한 테스트가 Electron 을 두 번 띄운다(팀 저장소를 만드는 앱 + 받는 앱) — 다른 spec 과 겹쳐 돌면
// 시작만으로 30초를 넘긴다. 기본 시간으로는 부족하다고 Playwright 에 먼저 말해 둔다.
test.slow()

// 팀 저장소를 흉내낸 로컬 bare repo 를 GitHub 주소처럼 쓴다 — 앱은 github.com 주소만 받으므로
// 그 주소를 로컬 repo 로 바꿔치기하는 insteadOf 를 앱 전용 전역 설정 파일(GIT_CONFIG_GLOBAL)에 둔다.
// GitHub API(로그인·들어갈 수 있는 보관함·초대)는 가짜 서버(`fake-github.ts`)다.
test('로그인하면 들어갈 수 있는 보관함과 받은 초대가 보이고, 초대를 수락해 받아 바로 연다 — 터미널 0회', async ({
  launch,
  serve
}) => {
  const github = await fakeGithub(serve, {
    vaults: ['team/team'],
    invitations: [{ id: 42, repo: 'lab/notes', inviter: 'carol' }]
  })
  const shared = tempDir('import-vault-team')
  const bare = join(shared, 'team.git')
  const gitConfig = join(shared, 'gitconfig')

  // 1) 팀 보관함 원본을 앱으로 만들어 bare 저장소로 올린다
  const source = await launch('import-vault-source-e2e')
  await goTo(source.page, 'settings')
  await source.page.getByTestId('vault-create').click()
  await expect(source.page.getByTestId('vault-status')).toHaveText(source.vaultDir)
  writeFileSync(join(source.vaultDir, 'wiki', 'team-note.md'), '# 팀 문서\n\n팀이 올린 문서다\n')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  execFileSync('git', ['add', '-A'], { cwd: source.vaultDir })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'team'], {
    cwd: source.vaultDir
  })
  execFileSync('git', ['push', '-q', bare, 'main'], { cwd: source.vaultDir })
  // 다음 앱이 같은 저장소를 받는다 — 여기서 닫아 둔다(폴더 정리는 fixture 가 한다)
  await source.app.close()
  // 목록의 보관함도, 초대받은 저장소도 같은 로컬 bare 로 간다
  writeFileSync(
    gitConfig,
    `[url "${bare}"]\n\tinsteadOf = https://github.com/team/team.git\n\tinsteadOf = https://github.com/lab/notes.git\n`
  )

  // 2) 보관함이 없는 새 컴퓨터 — 주소를 몰라도 로그인하고 골라 받는다
  const { app, page, root } = await launch('import-vault-e2e', {
    env: { GIT_CONFIG_GLOBAL: gitConfig, ...github.env }
  })
  const into = join(root, 'into')
  mkdirSync(into)
  /** 받을 곳 고르기 창 — dir 이 null 이면 사람이 창을 닫은 것이다 */
  const pickFolder = (dir: string | null): Promise<void> =>
    app.evaluate(({ dialog }, picked) => {
      Object.assign(dialog, {
        showOpenDialog: async () =>
          picked === null
            ? { canceled: true, filePaths: [] }
            : { canceled: false, filePaths: [picked] }
      })
    }, dir)

  await goTo(page, 'settings')
  await page.getByTestId('vault-import-open').click()
  // 주소로 받기는 접혀 있다 — GitHub 저장소만 받고, 로그인 전에는 나가지 않는다
  await page.getByTestId('vault-import-url-open').click()
  await page.getByTestId('vault-import-url').fill('https://gitlab.com/team/team')
  await expect(page.getByTestId('vault-import-hint')).toContainText('GitHub 주소가 아니에요')
  await expect(page.getByTestId('vault-import-start')).toBeDisabled()
  await page.getByTestId('vault-import-url').fill('https://github.com/team/team')
  // 로그인 전에는 나가지 않는다 — 단추가 잠기고 이유를 말한다 (#64)
  await expect(page.getByTestId('vault-import-start')).toBeDisabled()
  await expect(page.getByTestId('vault-import-start')).toHaveAttribute(
    'title',
    '먼저 위에서 GitHub에 로그인해 주세요'
  )

  await signIn(page, app)
  await expect(page.getByTestId('vault-import-start')).toBeEnabled()
  // 보관함인 저장소만 — 코드 저장소(alice/code)는 보이지 않는다
  await expect(page.getByTestId('team-vault:team/team')).toBeVisible()
  await expect(page.getByTestId('team-vault:alice/code')).toHaveCount(0)
  const invite = page.getByTestId('team-invitation:lab/notes')
  await expect(invite).toContainText('초대받음 · carol')
  // 받을 곳을 고르다 그만두면 초대는 수락하지 않은 채 남는다
  await pickFolder(null)
  await invite.getByRole('button').click()
  await expect(invite.getByRole('button')).toBeEnabled()
  expect(github.accepted).toEqual([])
  await pickFolder(into)
  await invite.getByRole('button').click()

  await expect(page.getByTestId('vault-status')).toHaveText(join(into, 'notes'), {
    timeout: 60_000
  })
  expect(github.accepted).toEqual([42])
  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/team-note.md')
  await expect(page.getByTestId('wiki-reader')).toContainText('팀이 올린 문서다')
})
