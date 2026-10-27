// MCP 서버 — 설정에서 더하고 끄면, 켠 서버만 채팅 엔진 CLI 에 넘어간다.
import { expect, test } from './fixtures'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo, openAdvancedSettings } from './helpers'

test('설정에서 MCP 서버를 더하고 끄면 채팅 엔진에는 켠 서버만 간다', async ({ launch }) => {
  const { page, vaultDir, userData } = await launch('mcp-e2e', {
    env: { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  // 명령 한 줄로 하나, 문서의 JSON 조각으로 하나
  await openAdvancedSettings(page)
  await page.getByTestId('mcp-name').fill('github')
  await page.getByTestId('mcp-target').fill('npx -y @modelcontextprotocol/server-github')
  await page.getByTestId('mcp-add').click()
  await expect(page.getByTestId('mcp-server:github')).toContainText('server-github')
  await page.getByText('설정 JSON 붙여 넣기').click()
  await page
    .getByTestId('mcp-json')
    .fill('{"mcpServers":{"docs":{"type":"http","url":"https://docs.example/mcp"}}}')
  await page.getByTestId('mcp-import').click()
  await expect(page.getByTestId('mcp-server:docs')).toContainText('https://docs.example/mcp')
  // 붙여 넣은 서버는 꺼진 채로 들어온다(#131) — 직접 켜야 채팅에 실린다
  await expect(page.getByTestId('mcp-server:docs')).toContainText('꺼짐')
  await page.getByTestId('mcp-enabled:docs').click()
  await expect(page.getByTestId('mcp-server:docs')).not.toContainText('꺼짐')
  // 잘못된 이름은 이유를 말하고 더하지 않는다
  await page.getByTestId('mcp-name').fill('bad name')
  await page.getByTestId('mcp-target').fill('npx x')
  await page.getByTestId('mcp-add').click()
  await expect(page.getByTestId('mcp-error')).toContainText('이름은')

  await goTo(page, 'chat')
  await page.getByTestId('chat-input').fill('MCP 서버를 말해')
  await page.getByTestId('chat-ask').click()
  await expect(page.getByTestId('chat-message-assistant').last()).toContainText(
    /MCP: docs github\s+설정: 있음/
  )

  // 끄면 그 서버는 빠지고, 다 끄면 설정째 넘기지 않는다
  await goTo(page, 'settings')
  // 켜 둔 서버가 있으면 '고급' 은 스스로 펼쳐진 채로 열린다
  await expect(page.getByTestId('settings-advanced-toggle')).toHaveAttribute(
    'aria-expanded',
    'true'
  )
  await page.getByTestId('mcp-enabled:github').click()
  await expect(page.getByTestId('mcp-server:github')).toContainText('꺼짐')
  await page.getByTestId('mcp-remove:docs').click()
  await page.getByTestId('mcp-remove-confirm-ok').click()
  await expect(page.getByTestId('mcp-server:docs')).toHaveCount(0)
  const saved = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')) as {
    mcpServers: { name: string; enabled: boolean }[]
  }
  expect(saved.mcpServers.map((s) => [s.name, s.enabled])).toEqual([['github', false]])

  await goTo(page, 'chat')
  await page.getByTestId('chat-input').fill('MCP 서버를 말해')
  await page.getByTestId('chat-ask').click()
  await expect(page.getByTestId('chat-message-assistant').last()).toContainText(
    'MCP: 없음 설정: 없음'
  )
})
