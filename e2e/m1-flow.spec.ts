import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { answerPurpose, goTo } from './helpers'

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

test('가짜 엔진으로 시작하기 → 볼트 → 클리핑 → 위키화 → 승인(거절 1·승인 1)이 main 병합까지 간다', async ({
  launch
}) => {
  // 폴더 선택 대화상자만 가짜다 — IPC·git·번들 vault_verify 는 실제로 돈다
  const {
    page: window,
    root,
    userData
  } = await launch('m1-e2e', {
    env: { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  })
  const clipping = join(root, 'note.md')
  writeFileSync(clipping, '# e2e clipping\n\nbody\n')

  // 첫 실행은 시작하기의 질문에서 열린다 — 연결은 이미 끝나 있고, GitHub 은 나중에 하면 볼트 단계가 지금 단계다
  await answerPurpose(window, null)
  await expect(window.getByTestId('start-step-engine')).toHaveAttribute('data-state', 'done')
  await expect(window.getByTestId('start-step-engine')).toContainText('e2e@example.com')
  await window.getByTestId('github-later').click()
  await expect(window.getByTestId('start-step-vault')).toHaveAttribute('data-state', 'current')

  // 준비는 연결과 보관함 둘뿐이다 — 볼트를 만들면 그 자리에서 끝난다(폴더는 고르지 않는다 — 문서 폴더)
  await window.getByTestId('vault-starter-create').click()
  const vaultDir = join(root, 'documents', '2nd-brain')
  await expect(window.getByTestId('start-complete')).toBeVisible()

  // 자료·위키화·승인은 준비가 아니라 지식 관리에서 반복하는 일이다
  await goTo(window, 'sources')
  // 준비가 끝났으므로 사이드바에서 시작하기가 빠진다
  await expect(window.getByTestId('nav-start')).toHaveCount(0)
  await window.getByTestId('sources-section').locator('input[type=file]').setInputFiles(clipping)
  await expect(window.getByTestId('sources-waiting')).toContainText(
    /위키 초안을 기다리는 자료 1(?!\d)/
  )

  // 자료 화면은 길만 알려 준다 — 시작 버튼은 옆 칸 위키화 탭 한 곳에 있다
  await window.getByTestId('sources-open-ingest').click()
  await expect(window.getByTestId('chat-tab-ingest')).toHaveAttribute('aria-selected', 'true')
  await window.getByTestId('ingest-start').click()
  await expect(window.getByTestId('ingest-outcome')).toContainText('위키 초안을 마쳤어요')
  // 결과는 날짜로 부른다 — 브랜치 이름은 화면에 올리지 않는다 (#64)
  await expect(window.getByTestId('ingest-outcome-run')).toHaveText(/^\d+월 \d+일 위키 초안/)
  // 사람 말 줄은 단계만 — AI 가 쓴 초안 본문·경로 줄은 접힌 자세히에만 남는다
  await expect(window.getByTestId('ingest-events')).toContainText('위키에 정리하는 중이에요')
  await expect(window.getByTestId('ingest-events')).not.toContainText('@@ wiki/')
  await expect(window.getByTestId('ingest-events')).not.toContainText('e2e ingest done')
  await expect(window.getByTestId('ingest-raw')).toContainText('e2e ingest done')
  await expect(window.getByTestId('ingest-summary')).toHaveText(
    '자료 1개 중 1개 초안 마침 · 페이지 초안 2개'
  )

  await goTo(window, 'review')
  await expect(window.getByTestId('review-approve-wiki/keep-page.md')).toBeVisible()
  // 경로 대신 제목이 먼저 읽힌다 — 경로는 위치 칸과 툴팁에 남는다
  await expect(window.getByTestId('review-title-wiki/keep-page.md')).not.toHaveText(
    'wiki/keep-page.md'
  )
  // 전체 승인은 거절이 있을 때만, 전체 거절은 아직 승인한 페이지가 있을 때만 누를 수 있다
  await expect(window.getByTestId('review-approve-all')).toBeDisabled()
  await window.getByTestId('review-reject-all').click()
  await expect(window.getByTestId('review-approve-wiki/keep-page.md')).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  await expect(window.getByTestId('review-reject-wiki/keep-page.md')).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(window.getByTestId('review-reject-all')).toBeDisabled()
  await window.getByTestId('review-approve-all').click()
  await expect(window.getByTestId('review-approve-wiki/keep-page.md')).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await window.getByTestId('review-reject-wiki/drop-page.md').click()
  await expect(window.getByTestId('review-approve-wiki/drop-page.md')).toHaveAttribute(
    'aria-pressed',
    'false'
  )

  // 확정은 병합·원복 수를 보이고 멈춘다 — 취소하면 git 이 그대로다
  await window.getByTestId('review-finalize').click()
  await expect(window.getByTestId('review-confirm')).toContainText('1개는 이번에 넣지 않아요')
  await window.getByTestId('review-confirm-cancel').click()
  await expect(window.getByTestId('review-confirm')).toHaveCount(0)
  expect(git(vaultDir, 'branch', '--show-current')).toMatch(/^app\/ingest-/)

  await window.getByTestId('review-finalize').click()
  await window.getByTestId('review-confirm-merge').click()
  await expect(window.getByTestId('review-result')).toContainText('페이지가 위키에 들어갔어요')
  await expect(window.getByTestId('review-result')).toContainText('1개 페이지가 위키에 들어갔어요')
  await expect(window.getByTestId('review-result')).toContainText(
    '이번에 넣지 않은 페이지: drop-page'
  )

  expect(git(vaultDir, 'branch', '--show-current')).toBe('main')
  expect(git(vaultDir, 'rev-list', '--merges', '--count', 'main')).toBe('1')
  expect(existsSync(join(vaultDir, 'wiki/keep-page.md'))).toBe(true)
  expect(existsSync(join(vaultDir, 'wiki/drop-page.md'))).toBe(false)
  expect(existsSync(join(vaultDir, 'raw/note.md'))).toBe(true)
  expect(readFileSync(join(vaultDir, 'wiki/INDEX.md'), 'utf8')).not.toContain('drop-page')
  expect(git(vaultDir, 'grep', '-l', '거절됨: drop-page', '--', 'outputs/runs')).not.toBe('')

  // 되돌리면 작업 브랜치로 돌아가 승인 목록이 다시 뜨고, 다시 확정하면 병합은 한 번뿐이다
  await window.getByTestId('review-undo').click()
  await expect(window.getByTestId('review-approve-wiki/keep-page.md')).toBeVisible()
  expect(git(vaultDir, 'branch', '--show-current')).toMatch(/^app\/ingest-/)
  expect(git(vaultDir, 'rev-list', '--merges', '--count', 'main')).toBe('0')
  await window.getByTestId('review-finalize').click()
  await window.getByTestId('review-confirm-merge').click()
  await expect(window.getByTestId('review-result')).toContainText('페이지가 위키에 들어갔어요')
  expect(git(vaultDir, 'rev-list', '--merges', '--count', 'main')).toBe('1')
  expect(existsSync(join(vaultDir, 'wiki/keep-page.md'))).toBe(true)
  expect(existsSync(join(userData, 'settings.json'))).toBe(true)
})
