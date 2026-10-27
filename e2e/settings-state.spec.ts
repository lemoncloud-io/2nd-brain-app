import { expect, test } from './fixtures'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc, revealInTree } from './helpers'

const FAKE_CLAUDE = join(__dirname, '../test/fixtures/fake-claude/e2e/claude')

test('설정 탭을 오가도 다른 탭 상태가 남고, 볼트가 준비되면 가드가 풀리며 사이드바가 갱신된다', async ({
  launch
}) => {
  // 채팅 탭은 로그인된 엔진이 필요하다 — 호스트의 claude 로그인 상태에 기대지 않게 가짜 CLI 를 쓴다
  const { page, vaultDir } = await launch('settings-state-e2e', {
    env: { CLAUDE_CLI_PATH: FAKE_CLAUDE }
  })
  // 볼트가 없으면 문서 자리는 가드 뒤에 있고 트리는 아직 없다.
  // 첫 실행은 시작하기에서 뜬다 — goTo 는 복귀 단추가 아직 안 그려졌으면 누르지 않으므로 그 단추를 기다려 누른다
  await page.getByTestId('nav-back-doc').click()
  await expect(page.getByTestId('setup-gate:doc')).toBeVisible()
  await expect(page.getByTestId('tree-file:wiki/INDEX.md')).toHaveCount(0)

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  // 사이드바 요약은 볼트 전환 신호(빈 wikiChanged)로 갱신된다
  await expect(page.getByTestId('sidebar-vault')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'keep.md'), '# Keep\n\n본문\n')

  // 가드가 풀리면 문서 자리가 볼트 기준으로 처음 마운트된다
  await goTo(page, 'wiki')
  await expect(page.getByTestId('setup-gate:doc')).toHaveCount(0)
  await expect(await revealInTree(page, 'wiki/INDEX.md')).toBeVisible()
  await expect(await revealInTree(page, 'wiki/keep.md')).toBeVisible()
  await openDoc(page, 'wiki/keep.md')
  await expect(page.getByTestId('wiki-reader')).toContainText('본문')

  await goTo(page, 'chat')
  await page.getByTestId('chat-input').fill('입력 중인 질문')

  // 설정 왕복 — 숨긴 채 마운트된 탭은 입력·선택을 잃지 않는다
  await goTo(page, 'settings')
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  await goTo(page, 'chat')
  await expect(page.getByTestId('chat-input')).toHaveValue('입력 중인 질문')
  await goTo(page, 'wiki')
  await expect(page.getByTestId('wiki-reader')).toContainText('본문')
})
