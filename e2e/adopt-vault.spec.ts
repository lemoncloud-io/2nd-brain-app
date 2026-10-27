import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { goTo } from './helpers'
import { tempDir } from './run-tree'

// 이미 쓰던 Obsidian 보관함을 버튼만으로 — 열기 → 그대로 두고 보관함으로 쓰기 → 위키화 → 첫 페이지 승인.
// 끝까지 원래 노트는 한 바이트도 바뀌지 않는다(`.git` 과 앱이 더한 것 말고는 같은 해시).
test.slow()

const hashes = (dir: string, only?: Set<string>): Map<string, string> => {
  const out = new Map<string, string>()
  const walk = (at: string): void => {
    for (const name of readdirSync(at)) {
      if (name === '.git') continue
      const full = join(at, name)
      if (statSync(full).isDirectory()) walk(full)
      else {
        const rel = relative(dir, full)
        if (!only || only.has(rel)) {
          out.set(rel, createHash('sha1').update(readFileSync(full)).digest('hex'))
        }
      }
    }
  }
  walk(dir)
  return out
}

test('Obsidian 보관함을 그대로 두고 보관함으로 쓰고, 위키화해 첫 페이지를 승인해도 원래 노트는 0 diff', async ({
  launch
}) => {
  const picked = tempDir('adopt-obsidian')
  mkdirSync(join(picked, '.obsidian'))
  mkdirSync(join(picked, 'projects'))
  mkdirSync(join(picked, 'attachments'))
  writeFileSync(join(picked, '.obsidian', 'app.json'), '{"alwaysUpdateLinks":true}\n')
  writeFileSync(join(picked, 'Home.md'), '# 홈\n\n[[회의록]] 을 본다\n')
  writeFileSync(
    join(picked, 'projects', '회의록.md'),
    '---\ntags: [meeting]\n---\n# 회의록\n\n결정 하나\n'
  )
  writeFileSync(join(picked, 'attachments', 'pic.png'), Buffer.from([137, 80, 78, 71]))
  const before = hashes(picked)

  const { page } = await launch('adopt-e2e', {
    dialogDir: picked,
    env: { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  })

  // 열기 → 뼈대가 없으므로 읽기 중심으로 열린다 → 보관함으로 쓰기로 변환한다
  await goTo(page, 'settings')
  await page.getByTestId('vault-open').filter({ visible: true }).click()
  await expect(page.getByTestId('vault-status')).toHaveText(picked)
  await expect(page.getByTestId('vault-generic-note')).toBeVisible()
  await page.getByTestId('vault-adopt-generic').click()
  await expect(page.getByTestId('vault-status')).toHaveText(picked)
  await expect(page.getByTestId('vault-adopted')).toContainText(
    '노트 2개의 사본이 위키 초안을 기다리고 있어요'
  )
  expect(
    readdirSync(join(picked, 'Clippings'))
      .filter((n) => n.endsWith('.md'))
      .sort()
  ).toEqual(['Home.md', '회의록.md'])

  // 위키화 → 승인 — 모두 버튼
  await page.getByTestId('vault-adopted-ingest').click()
  await expect(page.getByTestId('chat-tab-ingest')).toHaveAttribute('aria-selected', 'true')
  await page.getByTestId('ingest-start').click()
  await expect(page.getByTestId('ingest-outcome')).toContainText('위키 초안을 마쳤어요', {
    timeout: 60_000
  })
  await goTo(page, 'review')
  await expect(page.getByTestId('review-approve-wiki/keep-page.md')).toBeVisible()
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
  expect(existsSync(join(picked, 'wiki', 'keep-page.md'))).toBe(true)
  // 위키화는 사본을 원본 보관함(raw)으로 옮겼다
  expect(existsSync(join(picked, 'raw', '회의록.md'))).toBe(true)

  // 원래 파일은 모두 제자리·같은 내용이다
  expect(hashes(picked, new Set(before.keys()))).toEqual(before)
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: picked, encoding: 'utf8' }).trim()
  expect(
    git('status', '--porcelain', '--', 'Home.md', 'projects', 'attachments', '.obsidian')
  ).toBe('')
  expect(git('log', '--format=%s', '--', 'Home.md')).toBe('chore: adopt vault')
})
