import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expectReadableTooltip, goTo, openDoc, revealInTree } from './helpers'
import { tempDir } from './run-tree'

// 한 테스트가 Electron 을 두 번 띄운다(팀 저장소를 만드는 앱 + 받는 앱) — 다른 spec 과 겹쳐 돌면
// 시작만으로 30초를 넘긴다. 기본 시간으로는 부족하다고 Playwright 에 먼저 말해 둔다.
test.slow()

const commit = (dir: string, message: string): void => {
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', message], {
    cwd: dir
  })
}

test('앱을 열면 팀 변경이 받아져 있고, 상태 줄을 눌러서도 받는다', async ({ launch }) => {
  const shared = tempDir('sync-team')
  const bare = join(shared, 'team.git')
  const mate = join(shared, 'mate')
  const userData = tempDir('sync-user-data')

  // 팀 보관함을 만들어 올리고, 동료 체크아웃을 하나 둔다
  const first = await launch('sync-first-e2e', { userData })
  await goTo(first.page, 'settings')
  await first.page.getByTestId('vault-create').click()
  await expect(first.page.getByTestId('vault-status')).toHaveText(first.vaultDir)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: first.vaultDir })
  execFileSync('git', ['push', '-q', '-u', 'origin', 'main'], { cwd: first.vaultDir })
  execFileSync('git', ['clone', '-q', bare, mate])
  await first.app.close()

  // 동료가 문서를 올린다
  writeFileSync(join(mate, 'wiki', 'from-mate.md'), '# 동료 문서\n\n동료가 올린 문서다\n')
  commit(mate, 'mate page')
  execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: mate })

  // 같은 보관함으로 앱을 다시 연다 — 받기를 누르지 않았는데 이미 받아져 있다
  const { page } = await launch('sync-e2e', { userData, dialogDir: first.vaultDir })
  await expect(page.getByTestId('sidebar-sync-text')).toHaveText(/팀 변경 1개를 받았어요/, {
    timeout: 60_000
  })
  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/from-mate.md')
  await expect(page.getByTestId('wiki-reader')).toContainText('동료가 올린 문서다')

  // 레일 버튼으로 다시 받는다 — 이번엔 받을 것이 없다
  writeFileSync(join(mate, 'wiki', 'second.md'), '# 둘째\n\n두 번째 문서\n')
  commit(mate, 'mate second page')
  writeFileSync(join(mate, 'wiki', 'third.md'), '# 셋째\n\n세 번째 문서\n')
  commit(mate, 'mate third page')
  execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: mate })
  // 받은 수가 달라진다 — 버튼이 실제로 받지 않으면 1건 그대로라 빨개진다
  await page.getByTestId('sidebar-sync').click()
  await expect(page.getByTestId('sidebar-sync-text')).toHaveText(/팀 변경 2개를 받았어요/, {
    timeout: 60_000
  })
  await expect(await revealInTree(page, 'wiki/second.md')).toBeVisible()
})

test('같은 문서를 둘이 고쳤으면 팀 것·내 것을 골라 끝낸다 — 화면에 git 어휘 0개', async ({
  launch
}) => {
  const shared = tempDir('conflict-team')
  const bare = join(shared, 'team.git')
  const mate = join(shared, 'mate')
  const userData = tempDir('conflict-user-data')

  const first = await launch('conflict-first-e2e', { userData })
  const vaultDir = first.vaultDir
  await goTo(first.page, 'settings')
  await first.page.getByTestId('vault-create').click()
  await expect(first.page.getByTestId('vault-status')).toHaveText(vaultDir)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: vaultDir })
  execFileSync('git', ['push', '-q', '-u', 'origin', 'main'], { cwd: vaultDir })
  execFileSync('git', ['clone', '-q', bare, mate])
  await first.app.close()

  // 팀과 내가 같은 문서를 다르게 고친다
  writeFileSync(join(mate, 'wiki', 'INDEX.md'), '# 팀이 고친 안내\n\n팀 쪽 문장\n')
  commit(mate, 'mate edits index')
  execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: mate })
  writeFileSync(join(vaultDir, 'wiki', 'INDEX.md'), '# 내가 고친 안내\n\n내 쪽 문장\n')
  commit(vaultDir, 'i edit index')

  const { page } = await launch('conflict-e2e', { userData, dialogDir: vaultDir })
  await goTo(page, 'review')
  await expect(page.getByTestId('conflict-path')).toHaveText('wiki/INDEX.md', { timeout: 60_000 })
  await expect(page.getByTestId('conflict-pick-team-text')).toContainText('팀 쪽 문장')
  await expect(page.getByTestId('conflict-pick-mine-text')).toContainText('내 쪽 문장')

  const picker = page.getByTestId('conflict-picker')
  for (const word of ['브랜치', '머지', '병합', '충돌', 'rebase', '커밋', '푸시', '클론']) {
    await expect(picker).not.toContainText(word)
  }

  await page.getByTestId('conflict-pick-team').click()
  await expect(page.getByTestId('conflict-picker')).toHaveCount(0, { timeout: 60_000 })

  // 팀 것이 남고 내 것은 옆에 남아 있다
  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/INDEX.md')
  await expect(page.getByTestId('wiki-reader')).toContainText('팀이 고친 안내')
  const kept = `wiki/INDEX-충돌-내것-${new Date().toLocaleDateString('sv-SE')}.md`
  await expect(await revealInTree(page, `${kept}`)).toBeVisible()
})

test('안 올린 작업이 상태 줄에 보이고, 올리면 사라진다', async ({ launch }) => {
  const shared = tempDir('ahead-team')
  const bare = join(shared, 'team.git')
  const userData = tempDir('ahead-user-data')

  const first = await launch('ahead-first-e2e', { userData })
  const vaultDir = first.vaultDir
  await goTo(first.page, 'settings')
  await first.page.getByTestId('vault-create').click()
  await expect(first.page.getByTestId('vault-status')).toHaveText(vaultDir)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: vaultDir })
  execFileSync('git', ['push', '-q', '-u', 'origin', 'main'], { cwd: vaultDir })
  await first.app.close()

  // 올리지 않은 내 작업 두 건
  writeFileSync(join(vaultDir, 'wiki', 'note-one.md'), '# 하나\n')
  commit(vaultDir, 'note one')
  writeFileSync(join(vaultDir, 'wiki', 'note-two.md'), '# 둘\n')
  commit(vaultDir, 'note two')

  const { page } = await launch('ahead-e2e', { userData, dialogDir: vaultDir })
  await expect(page.getByTestId('sidebar-sync-text')).toContainText('안 올린 작업 2개', {
    timeout: 60_000
  })

  // 가장 긴 문구(받기 결과 + 안 올린 작업)에서도 상태 줄이 좁은 사이드바에서 가로로 읽힌다 —
  // 짧은 문구만 보는 dock.spec 의 단언은 줄바꿈이 필요한 이 길이에 닿지 않는다
  await expectReadableTooltip(page.getByTestId('sidebar-sync-text'))

  // 사용자가 실제로 쓰는 길로 올린다 — 설정의 "지금 올리기". 누른 뒤 레일이 스스로 맞아야 한다
  await goTo(page, 'settings')
  await page.getByTestId('github-push').click()
  await expect(page.getByTestId('github-push-result')).toContainText('올렸어요', {
    timeout: 60_000
  })
  // 받기 상태가 끝난 문구로 돌아오고 거기에 안 올린 작업이 없어야 한다 —
  // "받는 중" 은 그 자체로 안 올린 작업을 말하지 않으므로 통과시켜 주면 안 된다
  await expect(page.getByTestId('sidebar-sync-text')).toHaveText(
    /(받았어요|새 팀 변경이 없어요)$/,
    { timeout: 60_000 }
  )
})
