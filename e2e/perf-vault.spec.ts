// 수백 쪽 보관함에서 쓸 만한가 — 편집 기본기가 기준 볼트(knowledge, 위키 234쪽)에서 멈추지 않는지 잰다.
// 기본은 240쪽을 만들어 재고, `KNOWLEDGE_VAULT=<경로>` 면 그 볼트의 로컬 복제(`git clone --local`)로 잰다 —
// 앱은 열 때 팀 변경을 받으므로 원본을 그대로 열지 않는다. 잰 값은 테스트 주석(annotations)에 남는다.
import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc, revealInTree } from './helpers'
import { tempDir } from './run-tree'
import type { AppApi } from '../src/shared/ipc-contract'

type WithApi = { api: AppApi }

test.slow()

const PAGES = 240

const synthesize = (vaultDir: string): void => {
  mkdirSync(join(vaultDir, 'wiki', 'topics'), { recursive: true })
  const para = '긴 문단이다. 여러 문서를 오가며 [[topics/p-1|첫 쪽]] 과 #주제 를 적는다. '.repeat(
    12
  )
  for (let i = 0; i < PAGES; i += 1) {
    const links = [1, 7, 31].map((d) => `[[topics/p-${(i + d) % PAGES}]]`).join(' · ')
    const body = Array.from({ length: 12 }, (_, s) => `## 절 ${s}\n\n${para}\n\n- [ ] 할 일 ${s}\n`)
    writeFileSync(
      join(vaultDir, 'wiki', 'topics', `p-${i}.md`),
      `---\ntype: topic\ntags: [t${i % 9}]\n---\n\n# 쪽 ${i}\n\n${links}\n\n${body.join('\n')}`
    )
  }
}

/** 위키에서 가장 큰 문서 — 가장 무거운 편집을 잰다 */
const largestWikiPage = (vaultDir: string): string => {
  let best = { rel: '', size: -1 }
  const walk = (dir: string, prefix: string): void => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue
      const full = join(dir, name)
      const rel = `${prefix}/${name}`
      if (statSync(full).isDirectory()) walk(full, rel)
      else if (name.endsWith('.md') && statSync(full).size > best.size) {
        best = { rel, size: statSync(full).size }
      }
    }
  }
  walk(join(vaultDir, 'wiki'), 'wiki')
  return best.rel
}

test('수백 쪽 보관함 — 열기·편집·태그·언급·검색이 멈추지 않는다', async ({ launch }) => {
  const source = process.env['KNOWLEDGE_VAULT']
  let vaultDir: string
  if (source) {
    vaultDir = join(tempDir('perf-knowledge'), 'vault')
    execFileSync('git', ['clone', '-q', '--local', source, vaultDir])
    execFileSync('git', ['remote', 'remove', 'origin'], { cwd: vaultDir })
  } else {
    // 앱으로 만든 뒤 닫고 쪽을 채운다 — 사람은 이미 찬 보관함을 연다
    // (방금 쓴 수백 개를 따라잡는 감시자를 재지 않는다)
    const setup = await launch('perf-setup')
    await goTo(setup.page, 'settings')
    await setup.page.getByTestId('vault-create').click()
    await expect(setup.page.getByTestId('vault-status')).toHaveText(setup.vaultDir)
    await setup.app.close()
    vaultDir = setup.vaultDir
    synthesize(vaultDir)
    execFileSync('git', ['add', '-A'], { cwd: vaultDir })
    execFileSync('git', ['commit', '-qm', 'note: perf pages'], { cwd: vaultDir })
  }
  const { page } = await launch('perf', { dialogDir: vaultDir })
  await goTo(page, 'settings')
  await page.getByTestId('vault-open').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  const took: Record<string, number> = {}
  const time = async (name: string, run: () => Promise<unknown>): Promise<void> => {
    const start = Date.now()
    await run()
    took[name] = Date.now() - start
  }

  await goTo(page, 'wiki')
  const rel = largestWikiPage(vaultDir)
  // 방금 쓴 파일을 감시자가 트리에 올릴 때까지 — 여기까지는 준비 시간이지 사람이 기다리는 동작이 아니다
  await expect(page.getByTestId(`tree-dir:${rel.slice(0, rel.lastIndexOf('/'))}`)).toBeAttached({
    timeout: 15_000
  })
  await time('폴더 펴기', async () => {
    await expect(await revealInTree(page, rel)).toBeVisible()
  })
  await time('문서 열기', async () => {
    await openDoc(page, rel)
    await expect(page.getByTestId('wiki-reader')).toBeVisible()
  })
  // 두 번째부터는 목록·파싱 캐시가 데워진 상태다 — 사람이 문서를 오가는 속도
  const other = rel === 'wiki/INDEX.md' ? rel : 'wiki/INDEX.md'
  await time('다른 문서 열기', async () => {
    await openDoc(page, other)
    await expect(page.getByTestId('wiki-reader')).toBeVisible()
    await openDoc(page, rel)
    await expect(page.getByTestId('wiki-reader')).toBeVisible()
  })
  await time('편집기 열기', async () => {
    await page.getByTestId('wiki-edit').click()
    await expect(page.getByTestId('wiki-editor-source').locator('.cm-line').first()).toBeVisible()
  })
  await page.getByTestId('wiki-editor-source').locator('.cm-line').first().click()
  await time('40자 입력', async () => {
    await page.keyboard.type('라이브 미리보기에서 치는 글자가 밀리지 않는지 본다 abcdefghij')
    await expect(page.getByTestId('wiki-editor-source')).toContainText('abcdefghij')
  })
  await page.getByTestId('wiki-cancel').click()
  await page.getByTestId('wiki-discard').click()

  await time('태그 칸', async () => {
    await page.getByTestId('sidebar-pane-tags').click()
    await expect(
      page.getByTestId('tag-pane').locator('[data-testid^="tag-row:"]').first()
    ).toBeVisible()
  })
  await time('언급 찾기(IPC)', () =>
    page.evaluate((r) => (window as unknown as WithApi).api.unlinkedMentions(r), rel)
  )
  await time('#태그 검색(IPC)', () =>
    page.evaluate(async () => {
      const { api } = window as unknown as WithApi
      const tags = await api.listTags()
      if ('error' in tags || tags.length === 0) return
      await api.searchWiki(`#${tags[0]!.tag}`)
    })
  )
  await time('점검 열기', async () => {
    await goTo(page, 'lint')
    await expect(page.getByTestId('lint-filters')).toBeVisible({ timeout: 30_000 })
  })

  for (const [name, ms] of Object.entries(took)) {
    test.info().annotations.push({ type: 'perf', description: `${name}: ${ms}ms` })
  }
  console.log(`[perf] ${source ? 'knowledge' : `${PAGES}쪽 합성`} ${rel}`, took)
  // 사람이 기다린다고 느끼는 선 — 한 동작 2초, 점검은 전체를 도는 일이라 10초
  for (const [name, ms] of Object.entries(took)) {
    expect(ms, name).toBeLessThan(name === '점검 열기' ? 10_000 : 2_000)
  }
})
