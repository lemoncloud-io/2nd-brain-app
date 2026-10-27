import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fakeGithub } from './fake-github'
import { answerPurpose, goTo, revealInTree } from './helpers'
import { tempDir } from './run-tree'

const LOGGED_OUT = join(__dirname, '../test/fixtures/fake-claude/logged-out/claude')
const FAKE_INSTALLER = join(__dirname, '../test/fixtures/fake-installer')

/** CLI 가 없는 빈 홈 — 이 머신의 ~/.local/bin/claude 가 후보에 잡히면 설치 화면이 아예 안 뜬다.
 *  가짜 설치기도 여기에 CLI 를 놓고, Playwright 가 테스트 산출물 폴더와 같이 치운다 */
const missingCliEnv = (extra: Record<string, string> = {}): Record<string, string> => {
  const home = test.info().outputPath('home')
  mkdirSync(home, { recursive: true })
  return {
    CLAUDE_CLI_PATH: '/nonexistent/claude',
    CODEX_CLI_PATH: '/nonexistent/codex',
    PATH: '/usr/bin:/bin',
    HOME: home,
    ...extra
  }
}

test('첫 실행은 시작하기에서 열리고, 준비가 안 된 탭은 시작하기로 보내며, 볼트를 만들면 볼트만 필요한 탭이 열린다', async ({
  launch
}) => {
  const { page } = await launch('onboarding-e2e', {
    env: { CLAUDE_CLI_PATH: LOGGED_OUT }
  })
  // 첫 질문부터 묻는다 — 답하지 않고 넘어갈 수 있다
  await expect(page.getByTestId('start-step-purpose')).toHaveAttribute('data-state', 'current')
  await answerPurpose(page, null)
  // 설치는 됐고 로그인 전 — 지금 단계 하나만 펼쳐 브라우저 로그인을 보인다
  await expect(page.getByTestId('start-step-engine')).toHaveAttribute('data-state', 'current')
  await expect(page.getByTestId('start-step-engine').getByTestId('engine-connect')).toHaveAttribute(
    'data-state',
    'logged-out'
  )
  await expect(page.getByTestId('start-step-engine').getByTestId('engine-login')).toBeVisible()
  await expect(page.getByTestId('start-step-vault')).toHaveAttribute('data-state', 'later')

  // 볼트가 필요한 자리 — 안내와 버튼, 누르면 시작하기로.
  // 채팅 칸은 볼트+로그인이라 같은 가드를 제 칸 안에 세운다
  for (const [target, gate] of [
    ['wiki', 'doc'],
    ['knowledge', 'knowledge'],
    ['chat', 'chat']
  ]) {
    await goTo(page, target)
    await expect(page.getByTestId(`setup-gate:${gate}`)).toBeVisible()
    await page.getByTestId(`setup-cta:${gate}`).click()
    await expect(page.getByTestId('start-steps')).toBeVisible()
  }

  // 로그인 전에도 볼트는 설정에서 만들 수 있다
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toBeVisible()

  await goTo(page, 'wiki')
  await expect(page.getByTestId('setup-gate:doc')).toHaveCount(0)
  await expect(await revealInTree(page, 'wiki/INDEX.md')).toBeVisible()

  // 로그인은 아직 — 채팅은 여전히 안내, 문구가 로그인을 가리킨다
  await goTo(page, 'chat')
  await expect(page.getByTestId('setup-gate:chat')).toContainText('로그인')

  // 시작하기는 볼트를 끝난 단계로 보이고, 지금 단계는 여전히 연결이다
  await goTo(page, 'start')
  await expect(page.getByTestId('start-step-vault')).toHaveAttribute('data-state', 'done')
  await expect(page.getByTestId('start-step-engine')).toHaveAttribute('data-state', 'current')
})

test('Claude 가 없으면 설치 버튼을 보이고, 직접 설치를 펼치면 이 OS 의 한 줄 명령과 복사 버튼이 있고, Codex 로 바꿀 수 있다', async ({
  launch
}) => {
  const { page } = await launch('onboarding-missing-e2e', {
    env: {
      CLAUDE_CLI_PATH: '/nonexistent/claude',
      CODEX_CLI_PATH: '/nonexistent/codex',
      PATH: '/usr/bin:/bin',
      HOME: '/nonexistent'
    }
  })
  await answerPurpose(page, null)
  const engine = page.getByTestId('start-step-engine')
  await expect(engine.getByTestId('engine-connect')).toHaveAttribute('data-state', 'missing')
  await expect(engine.getByTestId('engine-install')).toHaveText('Claude 설치')
  // 터미널 안내는 버튼이 안 될 때의 출구다 — 접혀 있다
  await expect(engine.getByTestId('engine-install-command')).toBeHidden()
  await engine.getByTestId('engine-install-manual').locator('summary').click()
  await expect(engine.getByTestId('engine-install-command')).toHaveText(
    process.platform === 'win32' ? /install\.ps1/ : /install\.sh/
  )
  await expect(engine.getByRole('button', { name: '명령 복사' })).toBeVisible()

  await engine.getByTestId('engine-switch:codex').click()
  await expect(engine).toContainText('Codex 연결')
  await expect(engine.getByTestId('engine-install')).toHaveText('Codex 설치')
  // 두 엔진 모두 설치 스크립트 한 줄 — npm 을 거치면 Node.js 선행 설치가 다시 생긴다
  await expect(engine.getByTestId('engine-install-command')).toHaveText(
    /chatgpt\.com\/codex\/install\.(sh|ps1)/
  )
  await expect(engine.getByTestId('engine-install-command')).not.toHaveText(/npm/)

  // 명령이 안 먹을 때 볼 증상표가 화면 안에 있다
  await expect(engine.getByTestId('engine-install-hints')).toContainText('터미널 문구를 찾아봐')
})

test('설치 버튼을 누르면 터미널 없이 CLI 가 깔리고 로그인 단계로 넘어간다', async ({ launch }) => {
  const { page } = await launch('onboarding-install-e2e', {
    env: missingCliEnv({ SECOND_BRAIN_INSTALL_CMD_CLAUDE: join(FAKE_INSTALLER, 'e2e') })
  })
  await answerPurpose(page, null)
  const connect = page.getByTestId('start-step-engine').getByTestId('engine-connect')
  await expect(connect).toHaveAttribute('data-state', 'missing')
  await connect.getByTestId('engine-install').click()
  await expect(connect).toHaveAttribute('data-state', 'logged-out')
  await expect(connect.getByTestId('engine-login')).toBeVisible()
})

test('Codex 로 바꾸고 설치 버튼을 누르면 같은 길로 Codex 가 깔리고 로그인 단계로 넘어간다', async ({
  launch
}) => {
  const { page } = await launch('onboarding-install-codex-e2e', {
    env: missingCliEnv({ SECOND_BRAIN_INSTALL_CMD_CODEX: join(FAKE_INSTALLER, 'e2e-codex') })
  })
  await answerPurpose(page, null)
  const connect = page.getByTestId('start-step-engine').getByTestId('engine-connect')
  await expect(connect).toHaveAttribute('data-state', 'missing')
  await connect.getByTestId('engine-switch:codex').click()
  await expect(connect.getByTestId('engine-install')).toHaveText('Codex 설치')
  await connect.getByTestId('engine-install').click()
  await expect(connect).toHaveAttribute('data-state', 'logged-out')
  await expect(connect.getByTestId('engine-login')).toBeVisible()
})

test('설치가 실패하면 마지막 오류 줄과 다시 시도 버튼이 보이고 직접 설치 안내가 펼쳐진다', async ({
  launch
}) => {
  const { page } = await launch('onboarding-install-fail-e2e', {
    env: missingCliEnv({ SECOND_BRAIN_INSTALL_CMD_CLAUDE: join(FAKE_INSTALLER, 'fail') })
  })
  await answerPurpose(page, null)
  const connect = page.getByTestId('start-step-engine').getByTestId('engine-connect')
  await expect(connect).toHaveAttribute('data-state', 'missing')
  await connect.getByTestId('engine-install').click()
  const error = connect.getByTestId('engine-install-error')
  await expect(error).toContainText('Claude 설치를 끝내지 못했어요')
  // stderr 의 마지막 줄이 사유다 — 설치기 출력이 아니라 앱 문구만 보이면 무엇이 막혔는지 모른다
  await expect(error).toContainText('curl: (6) Could not resolve host: claude.ai')
  await expect(connect.getByTestId('engine-install')).toHaveText('다시 시도')
  await expect(connect.getByTestId('engine-install')).toBeEnabled()
  // 접힌 수동 안내가 저절로 펼쳐져 한 줄 명령이 바로 보인다
  await expect(connect.getByTestId('engine-install-command')).toBeVisible()
  await expect(connect).toHaveAttribute('data-state', 'missing')
})

test('GitHub 주소가 아니면 왜 안 되는지 알려 주고, 설정에서 시작하기를 다시 연다', async ({
  launch
}) => {
  const { page } = await launch('onboarding-github-e2e', {
    env: { CLAUDE_CLI_PATH: LOGGED_OUT }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toBeVisible()

  const backup = page.getByTestId('team-repo')
  await backup.getByTestId('github-paste-open').click()
  const url = backup.getByTestId('github-url')
  const connect = backup.getByTestId('github-connect')
  // 빈 칸에서는 누르면 무엇을 하는지만 — 아직 틀린 게 없다
  await expect(backup.getByTestId('github-url-hint')).toContainText('연결하면 바로 한 번 올려요')
  // 로그인 전에는 만들기를 누를 수 없다
  await expect(backup.getByTestId('team-repo-create-start')).toBeDisabled()
  await expect(connect).toBeDisabled()

  await url.fill('git@github.com:kim/brain.git')
  await expect(backup.getByTestId('github-url-hint')).toContainText('SSH')
  await expect(connect).toBeDisabled()

  // GitHub 저장소만 쓴다 — 다른 곳 주소는 누르기 전에 막는다
  await url.fill('https://gitlab.com/kim/brain')
  await expect(backup.getByTestId('github-url-hint')).toContainText('GitHub 주소가 아니에요')
  await expect(connect).toBeDisabled()

  await url.fill('https://github.com/kim/brain/settings')
  await expect(backup.getByTestId('github-url-hint')).toContainText('안쪽')
  await expect(connect).toBeDisabled()

  // 올바른 주소에서만 누를 수 있다 — 로그인 전에 누르면 GitHub 로 나가지 않고 로그인부터 하라고 한다
  await url.fill('https://github.com/kim/brain')
  await expect(backup.getByTestId('github-url-hint')).toContainText('연결하면 바로 한 번 올려요')
  await expect(connect).toBeEnabled()
  await connect.click()
  await expect(backup.getByTestId('github-push-result')).toContainText('GitHub 로그인이 필요해요')
  await expect(backup).toHaveAttribute('data-state', 'none')

  // 첫 병합 뒤 사이드바에서 빠져도 설정에서 다시 연다
  await page.getByTestId('reopen-start').click()
  await expect(page.getByTestId('start-steps')).toBeVisible()
})

test('GitHub 을 나중에 하면 폴더를 고르지 않고 문서 폴더에 보관함을 만들고, 처음 3걸음이 보이고 오늘 노트 만들기가 채팅에 채워진다', async ({
  launch
}) => {
  const { page, root } = await launch('onboarding-first-steps-e2e', {
    env: { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  })
  await answerPurpose(page, '팀 운영 지식을 모으고 싶어요')
  // AI 는 이미 연결돼 있다 — 다음은 GitHub 이고, 나중에 할 수 있다
  await expect(page.getByTestId('start-step-github')).toHaveAttribute('data-state', 'current')
  await page.getByTestId('github-later').click()
  await expect(page.getByTestId('start-step-vault')).toHaveAttribute('data-state', 'current')

  await page.getByTestId('vault-starter-create').click()
  await expect(page.getByTestId('start-complete')).toBeVisible()
  // 고른 폴더가 아니라 기본 자리(문서 폴더)에 생겼고, 첫 질문의 답이 방향 문서에 커밋돼 있다
  const vault = join(root, 'documents', '2nd-brain')
  expect(existsSync(join(vault, 'wiki', 'INDEX.md'))).toBe(true)
  expect(readFileSync(join(vault, 'purpose.md'), 'utf8')).toContain('팀 운영 지식을 모으고 싶어요')
  expect(
    execFileSync('git', ['status', '--porcelain', '--', 'purpose.md'], {
      cwd: vault,
      encoding: 'utf8'
    })
  ).toBe('')
  await expect(page.getByTestId('start-first-steps')).toBeVisible()
  // 오늘 노트가 아직 없어 첫 걸음이 지금 단계다
  await expect(page.getByTestId('start-first-today')).toHaveAttribute('data-state', 'current')
  await expect(page.getByTestId('start-first-clip')).toHaveAttribute('data-state', 'later')
  await expect(page.getByTestId('start-first-approve')).toHaveAttribute('data-state', 'later')

  // 보내지 않고 채팅 입력칸에 채우고 채팅 탭으로 간다 — 구독 과금은 Enter를 누를 때만 나간다
  await page.getByTestId('first-today-chat').click()
  await expect(page.getByTestId('chat-tab-chat')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('chat-composer').locator('textarea')).toHaveValue(
    '오늘 노트 만들어줘'
  )
})

// 템플릿 생성 결과를 흉내낸다 — 픽스처를 master 브랜치 bare 저장소로 만들고, 생성된 저장소 주소를
// 앱 전용 전역 git 설정(GIT_CONFIG_GLOBAL)의 insteadOf 로 그 bare 에 돌린다(import-vault.spec 과 같은 수).
// generate API 는 가짜 GitHub 이 받아 적기만 한다.
test('첫 실행: 질문 → AI → GitHub 로그인 → 폴더를 고르지 않고 내 GitHub 에 템플릿 보관함을 만들어 받아 연다', async ({
  launch,
  serve
}) => {
  test.slow()
  const github = await fakeGithub(serve)
  const shared = tempDir('onboarding-template')
  const source = join(shared, 'source')
  const bare = join(shared, 'template.git')
  const gitConfig = join(shared, 'gitconfig')
  cpSync(resolve('test/fixtures/vault-template'), source, { recursive: true })
  execFileSync('git', ['init', '-q', '-b', 'master', source])
  execFileSync('git', ['add', '-A'], { cwd: source })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'template'], {
    cwd: source
  })
  execFileSync('git', ['init', '-q', '--bare', '-b', 'master', bare])
  execFileSync('git', ['push', '-q', bare, 'master'], { cwd: source })
  writeFileSync(
    gitConfig,
    `[url "${bare}"]\n\tinsteadOf = https://github.com/alice/2nd-brain.git\n`
  )

  const { app, page, root } = await launch('onboarding-template-e2e', {
    env: {
      CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude'),
      GIT_CONFIG_GLOBAL: gitConfig,
      ...github.env
    }
  })
  await expect(page.getByText('5단계 중 1단계')).toBeVisible()
  await answerPurpose(page, '우리 팀 서버 운영 지식')
  await expect(page.getByText('5단계 중 3단계')).toBeVisible()

  // GitHub 단계는 자료가 내 계정 비공개 저장소로 나간다는 것을 먼저 말한다
  const githubStep = page.getByTestId('start-step-github')
  await expect(githubStep).toHaveAttribute('data-state', 'current')
  await expect(githubStep.getByTestId('github-private-note')).toContainText('비공개 저장소')
  await app.evaluate(({ shell }) => {
    shell.openExternal = () => Promise.resolve()
  })
  await githubStep.getByTestId('github-login-start').click()
  await expect(githubStep).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await expect(githubStep).toContainText('alice')

  const vaultStep = page.getByTestId('start-step-vault')
  await expect(vaultStep).toHaveAttribute('data-state', 'current')
  await vaultStep.getByTestId('vault-starter-create').click()
  await expect(page.getByTestId('start-complete')).toBeVisible({ timeout: 60_000 })
  await expect(vaultStep).toContainText('비공개 저장소에 올렸어요')

  // 로그인한 계정에 템플릿으로 비공개 저장소를 하나 만들었다
  expect(github.created).toEqual([
    {
      owner: 'alice',
      name: '2nd-brain',
      private: true,
      template: 'lemoncloud-io/2nd-brain-template'
    }
  ])
  // 문서 폴더에 받았고, 템플릿에 있던 위키 페이지가 그대로 왔다
  const vault = join(root, 'documents', '2nd-brain')
  expect(existsSync(join(vault, 'wiki', 'aws-lambda.md'))).toBe(true)
  expect(readFileSync(join(vault, 'purpose.md'), 'utf8')).toContain('우리 팀 서버 운영 지식')
  expect(
    execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: vault, encoding: 'utf8' }).trim()
  ).toBe('https://github.com/alice/2nd-brain.git')
  // 방향 문서 커밋까지 올라가 있다 — 남으면 혼자 쓰는 저장소에 "팀에 확인 요청 보내기" 가 뜬다
  await expect
    .poll(() =>
      execFileSync('git', ['rev-list', '--count', 'origin/master..HEAD'], {
        cwd: vault,
        encoding: 'utf8'
      }).trim()
    )
    .toBe('0')
  expect(
    execFileSync('git', ['log', '--oneline', 'master', '--', 'purpose.md'], {
      cwd: bare,
      encoding: 'utf8'
    }).trim()
  ).not.toBe('')
  await goTo(page, 'wiki')
  await expect(await revealInTree(page, 'wiki/aws-lambda.md')).toBeVisible()
})
