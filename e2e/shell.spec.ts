import { expect, test } from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expectReadableTooltip, goTo, openChatTab, revealInTree } from './helpers'

const FAKE_CLAUDE = resolve('test/fixtures/fake-claude/e2e/claude')

test('채팅 칸은 기본으로 열려 있고, 탭을 옮겨도 쓰던 질문이 남는다', async ({ launch }) => {
  const { page, vaultDir } = await launch('chat-pane-e2e', {
    env: { CLAUDE_CLI_PATH: FAKE_CLAUDE }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  writeFileSync(join(vaultDir, 'wiki', 'INDEX.md'), '# INDEX\n\n[[keep-page]]\n')
  writeFileSync(join(vaultDir, 'wiki', 'keep-page.md'), '# Keep\n')

  // 채팅 칸은 처음부터 옆에 있다 — 하루가 여기서 시작한다
  await expect(page.getByTestId('chat-pane')).toBeVisible()
  await expect(page.getByTestId('chat-panel')).toBeVisible()
  // 사이드바의 파일 트리도 늘 거기 있다
  await expect(await revealInTree(page, 'wiki/INDEX.md')).toBeVisible()

  // 입력칸은 하나뿐이다 — 두 벌을 그리면 어디에 쓴 것인지 알 수 없다
  await expect(page.getByTestId('chat-input')).toHaveCount(1)
  await page.getByTestId('chat-input').fill('keep 페이지가 뭐야')
  await page.getByTestId('chat-ask').click()
  await expect(page.getByTestId('chat-message-assistant')).toContainText('볼트에서 찾은 답')

  // 쓰다 만 글은 탭을 옮겨도 남아야 한다 — 다른 탭이 채팅을 언마운트하면 사라진다
  await page.getByTestId('chat-input').fill('쓰다 만 질문')

  // 근거 칩 → 참고한 페이지 탭. 채팅은 살아 있고 탭으로 돌아온다
  await page.getByTestId('chat-refs').getByText('위키 · keep-page').click()
  await expect(page.getByTestId('wiki-peek-reader')).toBeVisible()
  await openChatTab(page, 'chat')
  await expect(page.getByTestId('chat-message-assistant')).toContainText('볼트에서 찾은 답')
  await expect(page.getByTestId('chat-input')).toHaveValue('쓰다 만 질문')

  // 웹 조사는 없앤 기능이다 — 답 아래에도 탭 띠에도 없다
  await expect(page.getByTestId('chat-research')).toHaveCount(0)
  await expect(page.getByTestId('chat-tab-research')).toHaveCount(0)

  // 위키화 칸 — 넣은 자료가 없으면 시작도 취소도 없이 "자료 넣기" 하나만 준다
  await openChatTab(page, 'ingest')
  await expect(page.getByTestId('ingest-empty-sources')).toBeVisible()
  await expect(page.getByTestId('ingest-start')).toHaveCount(0)
  await expect(page.getByTestId('ingest-cancel')).toHaveCount(0)
  await openChatTab(page, 'chat')
  await expect(page.getByTestId('chat-input')).toHaveValue('쓰다 만 질문')

  // 접었다 펴도 쓰던 글이 남는다 — 접기는 숨기는 것이지 없애는 것이 아니다
  await page.getByTestId('toggle-chat').click()
  await expect(page.getByTestId('chat-pane')).toBeHidden()
  await page.getByTestId('toggle-chat').click()
  await expect(page.getByTestId('chat-input')).toHaveValue('쓰다 만 질문')

  // ⌘J 는 어디서든 그 칸의 입력칸에 초점을 준다
  await goTo(page, 'knowledge')
  await page.keyboard.press('ControlOrMeta+KeyJ')
  await expect(page.getByTestId('chat-input')).toBeFocused()
})

test('그래프는 크기를 세어 보이고, 종류를 끄고 켜며, 확대·전체 보기를 준다', async ({ launch }) => {
  const { page, vaultDir } = await launch('graph-toolbar-e2e', {
    env: { CLAUDE_CLI_PATH: FAKE_CLAUDE }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  // 페이지 둘 + 아직 없는 페이지 하나
  writeFileSync(join(vaultDir, 'wiki', 'INDEX.md'), '# INDEX\n\n[[a]]\n')
  writeFileSync(join(vaultDir, 'wiki', 'a.md'), '# A\n\n[[b-missing]]\n')

  await goTo(page, 'graph')
  // 그래프는 보관함 전체를 담아 템플릿 문서도 페이지로 센다 — 넣은 둘이 들어왔는지만 본다
  await expect
    .poll(async () =>
      Number((await page.getByTestId('graph-kind-page').textContent())?.match(/\d+/)?.[0] ?? 0)
    )
    .toBeGreaterThanOrEqual(2)
  await expect(page.getByTestId('graph-kind-ghost')).toContainText('아직 없는 페이지 1')

  // 종류를 끄면 눌림 상태가 바뀐다 — 마지막 하나는 끌 수 없다
  await page.getByTestId('graph-kind-ghost').click()
  await expect(page.getByTestId('graph-kind-ghost')).toHaveAttribute('aria-pressed', 'false')

  // 마지막 하나는 끌 수 없다 — 셋을 다 끄면 빈 화면이 된다
  await page.getByTestId('graph-kind-system').click()
  await page.getByTestId('graph-kind-page').click()
  await expect(page.getByTestId('graph-kind-page')).toHaveAttribute('aria-pressed', 'true')

  await expect(page.getByTestId('graph-community')).toBeVisible()
  await page.getByTestId('graph-fit').click()
  await expect(page.getByTestId('graph-canvas')).toBeVisible()

  // 캔버스는 그림이라 키보드로 못 짚는다 — 점 목록이 같은 근거 칸을 연다
  await page.getByTestId('graph-node-list').getByText('페이지 목록에서 고르기').click()
  await page.getByTestId('graph-node-list').getByRole('button', { name: 'a', exact: true }).click()
  await expect(page.getByTestId('wiki-peek-reader')).toBeVisible()
  // Escape 는 초점이 어디 있든 근거를 닫는다
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('wiki-peek')).toHaveCount(0)
})

// 사람 확인(2026-10-23): 데스크탑 Claude 는 "hello?" 에 인사만 하는데, 앱은 질문 앞에 지시문과 검색 문서를 붙여
// 볼트 문서를 요약하고 그 문서들을 칩으로 띄웠다 — 질문은 그대로 가고, 칩은 답이 읽은 문서만이다
test('질문은 그대로 가고 앱 규칙은 시스템 프롬프트로 — 칩은 답이 읽은 문서만, 답 뒤에', async ({
  launch
}) => {
  const promptLog = join(tmpdir(), `prompt-${Date.now()}.txt`)
  const systemLog = join(tmpdir(), `system-${Date.now()}.txt`)
  const { page, vaultDir } = await launch('refs-after-e2e', {
    env: {
      CLAUDE_CLI_PATH: FAKE_CLAUDE,
      FAKE_CLAUDE_SLOW: '1',
      FAKE_CLAUDE_PROMPT_LOG: promptLog,
      FAKE_CLAUDE_SYSTEM_LOG: systemLog
    }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'keep-page.md'), '# Keep\n\nkeep 페이지의 본문이다\n')

  await goTo(page, 'chat')
  await page.getByTestId('chat-input').fill('keep 페이지가 뭐야')
  await page.getByTestId('chat-ask').click()

  // 답을 기다리는 동안 점 셋은 보이고 칩은 없다.
  // 시간이 아니라 `chat-pending` 의 존재로 "답 전" 을 고정한다 — 느린 기계에서도 같은 뜻이다
  await expect(page.getByTestId('chat-pending')).toBeVisible()
  await expect(page.getByTestId('chat-refs')).toHaveCount(0)

  // 답이 그 문서를 읽고 나면 칩이 된다
  await expect(page.getByTestId('chat-message-assistant')).toContainText('볼트에서 찾은 답')
  await expect(page.getByTestId('chat-refs')).toContainText('위키 · keep-page')

  // 엔진이 받은 것은 질문 그대로다 — 지시문·검색 문서가 앞에 붙지 않는다. 앱 규칙은 세션을 열 때 시스템 프롬프트로 갔다
  expect(readFileSync(promptLog, 'utf8')).toBe('keep 페이지가 뭐야')
  expect(readFileSync(systemLog, 'utf8')).toContain('사용자가 쓴 말로 답하라')
})

test('답이 실패하면 근거만 담긴 빈 말풍선을 남기지 않는다', async ({ launch }) => {
  const { page, vaultDir } = await launch('refs-fail-e2e', {
    env: { CLAUDE_CLI_PATH: FAKE_CLAUDE, FAKE_CLAUDE_FAIL: '1' }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'keep-page.md'), '# Keep\n\nkeep 페이지의 본문이다\n')

  await goTo(page, 'chat')
  await page.getByTestId('chat-input').fill('keep 페이지가 뭐야')
  await page.getByTestId('chat-ask').click()

  // 실패는 오류 안내로 말한다 — 답인 척하는 빈 풍선으로도, 실었을 뿐인 문서의 칩으로도 말하지 않는다
  await expect(page.getByTestId('chat-error')).toBeVisible()
  await expect(page.getByTestId('chat-message-assistant')).toHaveCount(0)
  await expect(page.getByTestId('chat-streaming')).toHaveCount(0)
  await expect(page.getByTestId('chat-refs')).toHaveCount(0)
})

test('사이드바는 보관함 이름·파일 트리·지식 관리를 늘 들고 있다', async ({ launch }) => {
  const { app, page, vaultDir, userData } = await launch('sidebar-e2e', {
    env: { CLAUDE_CLI_PATH: FAKE_CLAUDE }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'keep-page.md'), '---\ntype: concept\n---\n\n# Keep\n')

  // 보관함 폴더가 Obsidian 과 같은 모양으로 보인다 — 설정에 있는 동안에도 사라지지 않는다
  await expect(await revealInTree(page, 'wiki/keep-page.md')).toBeVisible()
  await expect(page.getByTestId('tree-dir:Clippings')).toBeVisible()

  // 트리에서 문서를 열면 중앙이 그 문서다
  await (await revealInTree(page, 'wiki/keep-page.md')).click()
  await expect(page.getByTestId('wiki-reader')).toContainText('Keep')

  // 자료·검색·그래프·점검·승인은 지식 관리 한 페이지의 구역이다
  await page.getByTestId('nav-knowledge').click()
  await expect(page.getByTestId('knowledge-view')).toBeVisible()
  await page.getByTestId('knowledge-tab-review').click()
  await expect(page.getByTestId('knowledge-tab-review')).toHaveAttribute('aria-selected', 'true')

  // 문서로 돌아오면 읽던 자리가 그대로다
  await page.getByTestId('nav-back-doc').click()
  await expect(page.getByTestId('wiki-reader')).toContainText('Keep')

  // 옛 셸의 아이콘 레일·목록 칸은 없다
  await expect(page.getByTestId('list-panel')).toHaveCount(0)
  await expect(page.getByTestId('nav-wiki')).toHaveCount(0)

  // 접으면 사라지되 죽지 않는다 — 트리의 키보드 커서는 메모리에만 있어서,
  // 다시 마운트됐다면 열린 파일로 돌아간다(편 폴더는 저장돼 있어 이 질문에 답하지 못한다)
  await (await revealInTree(page, 'wiki/keep-page.md')).click()
  await page.getByTestId('tree-file:wiki/keep-page.md').press('ArrowUp')
  const cursor = await page
    .getByTestId('file-tree')
    .locator('[role="treeitem"][tabindex="0"]')
    .getAttribute('data-testid')
  expect(cursor).not.toBe('tree-file:wiki/keep-page.md')
  await page.getByTestId('toggle-sidebar').click()
  await expect(page.getByTestId('sidebar')).toBeHidden()
  await page.getByTestId('toggle-sidebar').click()
  await expect(page.getByTestId('sidebar')).toBeVisible()
  await expect(page.getByTestId(cursor!)).toHaveAttribute('tabindex', '0')

  // 팀 변경 상태 줄은 사이드바를 다시 펼친 뒤에도 가로로 읽힌다
  await expectReadableTooltip(page.getByTestId('sidebar-sync-text'))

  // 접어 두고 앱을 껐다 켜면 접힌 채로 뜬다 — 배치를 매번 다시 접게 하지 않는다
  await page.getByTestId('toggle-sidebar').click()
  await expect(page.getByTestId('sidebar')).toBeHidden()
  await app.close()
  const again = await launch('sidebar-again-e2e', { userData, dialogDir: vaultDir })
  // 셸이 그려진 뒤에 본다 — 아직 안 붙은 칸도 toBeHidden 은 통과한다
  await expect(again.page.getByTestId('toggle-sidebar')).toBeVisible()
  await expect(again.page.getByTestId('sidebar')).toBeAttached()
  await expect(again.page.getByTestId('sidebar')).toBeHidden()
  await again.page.getByTestId('toggle-sidebar').click()
  await expect(again.page.getByTestId('sidebar')).toBeVisible()
})
