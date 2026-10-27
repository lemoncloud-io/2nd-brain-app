import { expect, test } from './fixtures'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo } from './helpers'

test('Graph 탭 — 로딩 표시 후 노드가 그려지고, 페이지 추가가 탭 이동 없이 반영된다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('graph-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  // 뼈대 볼트에도 wiki/INDEX.md가 있어 노드가 존재한다
  await goTo(page, 'graph')
  await expect(page.getByTestId('graph-view')).toBeVisible()
  // 렌더러 청크를 받고 첫 걸음을 떼기 전에도 빈 화면이 아니라 로딩 표시나 캔버스 중 하나가 보인다
  await expect(
    page.getByTestId('graph-loading').or(page.getByTestId('graph-canvas')).first()
  ).toBeVisible()
  const canvas = page.getByTestId('graph-canvas')
  await expect(canvas).toHaveAttribute('data-node-count', /^[1-9]\d*$/)
  await expect(canvas.locator('canvas').first()).toBeVisible()
  await expect(page.getByTestId('graph-loading')).toHaveCount(0)
  // 그래프 탭은 숨긴 채(0×0) 마운트된다 — 보이게 된 뒤 캔버스가 칸 크기로 다시 재져야 노드가 보인다
  await expect
    .poll(async () => (await canvas.locator('canvas').first().boundingBox())?.width ?? 0)
    .toBeGreaterThan(200)
  const before = Number(await canvas.getAttribute('data-node-count'))

  // 페이지 추가 → 탭을 떠나지 않아도 watcher 신호로 다시 그린다
  mkdirSync(join(vaultDir, 'wiki'), { recursive: true })
  writeFileSync(join(vaultDir, 'wiki', 'a.md'), '# A\n\n[[b]]\n')
  writeFileSync(join(vaultDir, 'wiki', 'b.md'), '# B\n')
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-node-count')), { timeout: 15000 })
    .toBeGreaterThanOrEqual(before + 2)
  await expect(canvas.locator('canvas').first()).toBeVisible()
})
