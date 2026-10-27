import { expect, test } from './fixtures'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo } from './helpers'

// 그래프가 두 번 뜨기를 기다리므로 기본 60초로는 모자란다
test.setTimeout(180000)

test('Graph 탭 — three.js 캔버스가 뜨고, 필터·호버가 그린 것을 다시 만들지 않는다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('graph-3d-e2e')
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  mkdirSync(join(vaultDir, 'wiki'), { recursive: true })
  writeFileSync(join(vaultDir, 'wiki', 'a.md'), '# A\n\n[[b]]\n')
  writeFileSync(join(vaultDir, 'wiki', 'b.md'), '# B\n')

  // 그래프를 열기 전에 이미 나던 오류는 그래프의 책임이 아니다 — 새로 생긴 것만 본다
  const before = [...errors]
  await goTo(page, 'graph')
  const canvas = page.getByTestId('graph-canvas')
  await expect(canvas).toHaveAttribute('data-node-count', /^[1-9]\d*$/)
  await expect(canvas.locator('canvas').first()).toBeVisible()
  await expect
    .poll(async () => (await canvas.locator('canvas').first().boundingBox())?.width ?? 0)
    .toBeGreaterThan(200)

  if (process.env['GRAPH_3D_SHOT']) await canvas.screenshot({ path: process.env['GRAPH_3D_SHOT'] })

  // 3D 를 켠 채 페이지를 더하면 그래프가 새로 그려진다 — 지난 그래프 자원을 놓다가
  // 새 점까지 놓아 버리면 화면이 빈다
  const before3d = Number(await canvas.getAttribute('data-node-count'))
  writeFileSync(join(vaultDir, 'wiki', 'c.md'), '# C\n\n[[a]]\n')
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-node-count')), { timeout: 15000 })
    .toBeGreaterThan(before3d)
  await expect(canvas.locator('canvas')).toHaveCount(1)
  await expect(canvas.locator('canvas').first()).toBeVisible()

  // 3D 에서도 종류 필터가 먹는다 — 끄면 눌린 표시가 풀리고 화면은 살아 있다.
  // 끄고 다시 켜면 화면이 원래 그림으로 **정확히** 돌아와야 한다 — 필터가 자리를 다시
  // 잡았다면 점들이 다른 자리에 앉아 그림이 달라진다
  // 3D 에서도 종류 필터가 먹는다 — 끄면 눌린 표시가 풀리고 화면은 살아 있다.
  // 필터는 무엇을 보일지만 다시 물어야 한다 — 자리를 다시 계산하면 점이 전부 튄다.
  // 엔진이 멎은 뒤(data-settled=1) 필터를 왕복해도 다시 돈 적이 없어야 한다(data-reheats=0)
  await expect(canvas).toHaveAttribute('data-settled', '1', { timeout: 60000 })
  // 필터·호버는 그린 점을 켜고 끄기만 한다 — 점을 다시 만들면(data-builds 가 는다) 큰 보관함에서
  // 누를 때마다, 마우스가 점을 지날 때마다 화면이 멎는다
  const built = await canvas.getAttribute('data-builds')
  await page.getByTestId('graph-kind-ghost').click()
  await expect(page.getByTestId('graph-kind-ghost')).toHaveAttribute('aria-pressed', 'false')
  await expect(canvas.locator('canvas')).toHaveCount(1)
  await page.getByTestId('graph-kind-ghost').click()
  await expect(page.getByTestId('graph-kind-ghost')).toHaveAttribute('aria-pressed', 'true')
  await expect(canvas).toHaveAttribute('data-reheats', '0')
  await expect(canvas).toHaveAttribute('data-settled', '1')
  await expect(canvas).toHaveAttribute('data-builds', built ?? '')

  // 호버도 같다 — 가장 큰 점(data-probe, 캔버스 안 좌표)에 올려 실제로 짚힌 것을 본 뒤 센다.
  // 시점이 돌 수 있으니 좌표를 다시 읽으며 몇 번 겨눈다
  const box = await canvas.boundingBox()
  if (!box) throw new Error('graph canvas has no box')
  await expect
    .poll(
      async () => {
        const [x, y] = ((await canvas.getAttribute('data-probe')) ?? '0,0').split(',').map(Number)
        await page.mouse.move(box.x + x, box.y + y)
        return (await canvas.getAttribute('data-hovered')) ?? ''
      },
      { timeout: 20000 }
    )
    .not.toBe('')
  await page.mouse.move(box.x + 2, box.y + 2)
  await expect(canvas).toHaveAttribute('data-hovered', '')
  await expect(canvas).toHaveAttribute('data-builds', built ?? '')

  // 색만으로는 무엇인지 알 수 없다 — 등급 범례가 같이 뜬다
  await expect(page.getByTestId('graph-stellar-legend')).toBeVisible()

  expect(errors.filter((text) => !before.includes(text))).toEqual([])
})
