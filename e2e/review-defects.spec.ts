import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo } from './helpers'

type ClipApi = { api: { clipFile(path: string): Promise<{ ok: boolean }> } }

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

test('병합 전 검사가 막으면 결함마다 고칠 방법·페이지 읽기·거절이 있고, 거절한 뒤 다시 확정하면 병합된다', async ({
  launch
}) => {
  const launched = await launch('review-defects-e2e', {
    env: {
      CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude')
    }
  })
  const { page, root, vaultDir } = launched
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  const clipping = join(root, 'note.md')
  writeFileSync(clipping, '# e2e clipping\n\nbody\n')
  const clipped = await page.evaluate(
    (path) => (window as unknown as ClipApi).api.clipFile(path),
    clipping
  )
  expect(clipped.ok).toBe(true)

  await goTo(page, 'ingest')
  await page.getByTestId('ingest-start').click()
  await expect(page.getByTestId('ingest-outcome')).toContainText('위키 초안을 마쳤어요')

  // 결함 심기 — 파이프라인은 frontmatter 를 코드로 지어 깨질 일이 없으므로,
  // 병합 전 검사가 막는 흐름은 테스트가 작업 브랜치에 직접 심는다
  expect(git(vaultDir, 'branch', '--show-current')).toMatch(/^app\/ingest-/)
  writeFileSync(
    join(vaultDir, 'wiki', 'drop-page.md'),
    '---\ntype: concept\ntags:\n\t- drop\n---\n\n# Drop Page\n'
  )
  git(vaultDir, 'add', '-A', '--', 'wiki/drop-page.md')
  git(vaultDir, 'commit', '-q', '-m', 'seed tab defect')

  await goTo(page, 'review')
  await expect(page.getByTestId('review-approve-wiki/drop-page.md')).toBeVisible()
  await page.getByTestId('review-finalize').click()
  await page.getByTestId('review-confirm-merge').click()

  // 막힌 결함은 원문 대신 고칠 방법이 먼저 읽히고, 어느 페이지 몇째 줄인지 붙는다
  await expect(page.getByTestId('review-result')).toContainText('위키에 넣지 않았어요')
  const row = page.getByTestId('review-defect-0')
  await expect(row).toContainText('속성 블록 들여쓰기에 탭이 있어요')
  await expect(row).toContainText('wiki/drop-page.md 4번째 줄')
  expect(git(vaultDir, 'rev-list', '--merges', '--count', 'main')).toBe('0')

  await page.getByTestId('review-defect-open-0').click()
  await expect(page.getByTestId('wiki-peek-reader')).toContainText('Drop Page')
  await page.keyboard.press('Escape')

  // 행에서 바로 거절하면 승인 목록의 거절 단추도 함께 눌린다
  await page.getByTestId('review-defect-reject-0').click()
  await expect(page.getByTestId('review-approve-wiki/drop-page.md')).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  await expect(page.getByTestId('review-defect-reject-0')).toHaveText('거절 취소')

  await page.getByTestId('review-finalize').click()
  await page.getByTestId('review-confirm-merge').click()
  await expect(page.getByTestId('review-result')).toContainText('1개 페이지가 위키에 들어갔어요')
  await expect(page.getByTestId('review-defects')).toHaveCount(0)
  expect(git(vaultDir, 'rev-list', '--merges', '--count', 'main')).toBe('1')
})
