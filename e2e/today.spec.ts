import { expect, test } from './fixtures'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo } from './helpers'

const FAKE_CLAUDE = resolve('test/fixtures/fake-claude/e2e/claude')

// 노트 이름은 이 컴퓨터의 달력 날짜다 — 테스트도 같은 방식으로 센다(lib/today-note.ts)
const dateKey = (at: Date): string =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`

const TODAY = dateKey(new Date())
const YESTERDAY = dateKey(new Date(Date.now() - 24 * 60 * 60 * 1000))

const noteText = (title: string, items: [string, boolean][]): string =>
  [
    `# ${title}`,
    '',
    '## 할 일',
    ...items.map(([t, done]) => `- [${done ? 'x' : ' '}] ${t}`),
    ''
  ].join('\n')

test('오늘 — 노트가 없으면 띠도 없고, 있으면 그 노트와 어제 미결을 띠가 말하고 어제에서 돌아온다', async ({
  launch
}) => {
  const { app, page, userData, vaultDir } = await launch('today-e2e', {
    env: { CLAUDE_CLI_PATH: FAKE_CLAUDE }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  // 오늘 노트가 없다 — 띠는 아예 뜨지 않는다. 만드는 일은 채팅이 한다
  await goTo(page, 'wiki')
  await expect(page.getByTestId('today-strip')).toHaveCount(0)

  // 채팅 빈 대화의 예시 칩이 그 문장을 입력칸에 채운다 — 보내는 것은 사용자다
  await goTo(page, 'chat')
  await page.getByTestId('chat-example').filter({ hasText: '오늘 노트 만들어줘' }).click()
  await expect(page.getByTestId('chat-input')).toHaveValue('오늘 노트 만들어줘')
  await expect(page.getByTestId('chat-message-user')).toHaveCount(0)

  // 노트가 생기면(여기서는 디스크에 직접) 띠가 오늘의 n/m 과 어제 미결을 센다
  mkdirSync(join(vaultDir, 'private'), { recursive: true })
  writeFileSync(
    join(vaultDir, 'private', `${YESTERDAY}.md`),
    noteText(YESTERDAY, [
      ['계약서 검토', false],
      ['회의록 정리', true],
      ['견적 보내기', false]
    ])
  )
  writeFileSync(
    join(vaultDir, 'private', `${TODAY} 하루.md`),
    noteText(TODAY, [
      ['아침 회의', true],
      ['보고서 초안', false]
    ])
  )

  // 트리가 새 파일을 읽은 뒤에 눌러야 실제로 잰다 — 감시는 묶어서 오므로 늦다
  await expect(page.getByTestId('tree-dir:private')).toBeVisible()

  // ⌘T 가 그 노트를 연다 — 트리에서 찾아 들어가지 않는다(사이드바에 따로 행을 두지 않는다)
  await page.keyboard.press('ControlOrMeta+KeyT')
  await expect(page.getByTestId('wiki-reader')).toContainText('보고서 초안')
  await expect(page.getByTestId('today-progress')).toContainText('오늘 할 일 1/2')
  // 지난 노트 단추는 날짜를 말한다 — 주말 뒤에도 어느 날 것인지 안다
  const [, month, day] = YESTERDAY.split('-')
  await expect(page.getByTestId('today-previous')).toHaveText(
    `${Number(month)}/${Number(day)} 노트에 남은 일 2`
  )

  // 어제 미결을 누르면 어제 노트로 간다 — 띠는 남아 오늘로 돌아오는 단추 하나를 준다
  await page.getByTestId('today-previous').click()
  await expect(page.getByTestId('wiki-reader')).toContainText('계약서 검토')
  await expect(page.getByTestId('today-wrapup')).toHaveCount(0)
  await page.getByTestId('today-back').click()
  await expect(page.getByTestId('wiki-reader')).toContainText('보고서 초안')
  await page.getByTestId('today-previous').click()
  await expect(page.getByTestId('wiki-reader')).toContainText('계약서 검토')

  // 단축키 — 어디에 있든 오늘 노트로 돌아오고, 옆 칸은 한 손으로 접었다 편다
  await page.keyboard.press('ControlOrMeta+Backslash')
  await expect(page.getByTestId('chat-pane')).toBeHidden()
  await page.keyboard.press('ControlOrMeta+Backslash')
  await expect(page.getByTestId('chat-pane')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+KeyT')
  await expect(page.getByTestId('wiki-reader')).toContainText('보고서 초안')
  await app.close()

  // 두 번째 실행 — 위키화·승인을 한 번도 안 했어도 시작하기가 아니라 오늘 노트로 열린다
  const second = await launch('today-again-e2e', {
    env: { CLAUDE_CLI_PATH: FAKE_CLAUDE },
    userData,
    dialogDir: vaultDir
  })
  await expect(second.page.getByTestId('wiki-reader')).toContainText('보고서 초안')
  await expect(second.page.getByTestId('start-steps')).toHaveCount(0)
  await expect(second.page.getByTestId('nav-start')).toHaveCount(0)
})
