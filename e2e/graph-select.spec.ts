import { expect, test } from './fixtures'
import type { Locator, Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo } from './helpers'

test.setTimeout(180000)

/**
 * 카메라가 다 오면 탐침이 멈춘다 — 날아가기·전체 보기 뒤에 빈 곳·점을 누르기 전에 둔다.
 * 고른 채로는 자동 회전이 꺼져 있어 탐침은 카메라가 멈추면 멈춘다
 */
const settleCamera = async (page: Page, canvas: Locator): Promise<void> => {
  await expect
    .poll(
      async () => {
        const first = await canvas.getAttribute('data-probe')
        await page.waitForTimeout(500)
        const second = await canvas.getAttribute('data-probe')
        return first !== null && first === second ? 'settled' : 'moving'
      },
      { timeout: 30000 }
    )
    .toBe('settled')
}

test('그래프 점을 누르면 고른 채 날아가고, 옆 칸에 이어진 페이지가 뜬다', async ({ launch }) => {
  const { page, vaultDir } = await launch('graph-select-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  // Alpha 는 Beta·Delta 를 가리키고 Gamma 가 Alpha 를 가리킨다
  mkdirSync(join(vaultDir, 'wiki'), { recursive: true })
  writeFileSync(join(vaultDir, 'wiki', 'a.md'), '# Alpha\n\n[[b]] [[d]]\n')
  writeFileSync(join(vaultDir, 'wiki', 'b.md'), '# Beta\n')
  writeFileSync(join(vaultDir, 'wiki', 'c.md'), '# Gamma\n\n[[a]]\n')
  writeFileSync(join(vaultDir, 'wiki', 'd.md'), '# Delta\n')

  await goTo(page, 'graph')
  const canvas = page.getByTestId('graph-canvas')
  const list = page.getByTestId('graph-node-list')
  await list.locator('summary').click()
  await expect(list.getByRole('button', { name: 'c', exact: true })).toBeVisible({ timeout: 30000 })
  await expect(canvas).toHaveAttribute('data-settled', '1', { timeout: 60000 })

  // 목록에서 고르면 옆 칸이 그 페이지를 열고, 그래프도 그 점을 고른다
  await list.getByRole('button', { name: 'a', exact: true }).click()
  const peek = page.getByTestId('wiki-peek')
  await expect(peek.getByTestId('wiki-peek-reader')).toContainText('Alpha')
  await expect(canvas).not.toHaveAttribute('data-selected', /^$/)
  const first = await canvas.getAttribute('data-selected')

  // 날아간 뒤 모습 — GRAPH_SELECT_SHOT 이 있으면 찍어 둔다(눈으로 보는 확인용)
  const shot = process.env['GRAPH_SELECT_SHOT']
  if (shot) {
    // 애니메이션 끝 모습 — 스크린샷을 찍을 때만 기다린다 (화면 밖 점은 음수 좌표다)
    await expect(canvas).toHaveAttribute('data-probe', /^-?\d+,-?\d+$/)
    await page.screenshot({ path: shot })
  }
  // 이어진 페이지는 본문 뒤에 접혀 있다 — 펴면 그래프 이웃이 뜬다
  await peek.getByTestId('wiki-peek-connections-toggle').click()
  const connections = peek.getByTestId('wiki-peek-connection')
  await expect(connections).toHaveText([/Beta/, /Delta/, /Gamma/])

  // 이어진 페이지를 누르면 옆 칸도 그래프도 그 페이지로 옮겨 간다
  await connections.filter({ hasText: 'Gamma' }).click()
  await expect(peek.getByTestId('wiki-peek-reader')).toContainText('Gamma')
  await expect(canvas).not.toHaveAttribute('data-selected', first ?? '')
  await expect(canvas).not.toHaveAttribute('data-selected', /^$/)
  await settleCamera(page, canvas)

  // 빈 곳을 누르면 고르기가 풀리고 옆 칸도 닫힌다 — 날아간 카메라가 다 와야 빗나가지 않는다.
  // 구석 4px은 옆 칸 크기 조절 띠에 닿지 않는 자리다 (띠를 넓히면 이 클릭을 가로채므로 넓히지 않는다)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('graph canvas has no box')
  await page.mouse.click(box.x + 4, box.y + box.height - 4)
  await expect(canvas).toHaveAttribute('data-selected', '')
  await expect(page.getByTestId('wiki-peek')).toHaveCount(0)

  // 캔버스에서 점을 직접 눌러도 고른다 — 전체 보기로 담고 탐침이 멈추면 겨누고,
  // 시점이 돌 수 있으니 탐침 좌표를 다시 읽으며 몇 번 누른다
  await page.getByTestId('graph-fit').click()
  await settleCamera(page, canvas)
  await expect(canvas).toHaveAttribute('data-probe', /^-?\d+,-?\d+$/)
  await expect
    .poll(
      async () => {
        const [x, y] = ((await canvas.getAttribute('data-probe')) ?? '0,0').split(',').map(Number)
        await page.mouse.click(box.x + x, box.y + y)
        return (await canvas.getAttribute('data-selected')) ?? ''
      },
      { timeout: 20000 }
    )
    .not.toBe('')
  await expect(page.getByTestId('wiki-peek')).toBeVisible()

  // 고르기는 자리를 다시 계산하지 않는다 — 엔진이 다시 돈 적이 없다
  await expect(canvas).toHaveAttribute('data-reheats', '0')
})
