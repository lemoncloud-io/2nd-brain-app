import { type Locator, type Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo } from './helpers'

// 그래프가 뜨기를 기다리고 15초 연출을 끝까지 본다
test.setTimeout(180000)

/** 이어진 페이지 40개 + 아무 데도 안 이어진 페이지 3개 */
const seedWiki = (vaultDir: string): void => {
  mkdirSync(join(vaultDir, 'wiki'), { recursive: true })
  const N = 40
  for (let i = 0; i < N; i++) {
    const links = [`[[p${(i * 3 + 1) % N}]]`, `[[p${(i * 7 + 5) % N}]]`]
    writeFileSync(join(vaultDir, 'wiki', `p${i}.md`), `# P${i}\n\n${links.join(' ')}\n`)
  }
  for (const id of ['solo-a', 'solo-b', 'solo-c'])
    writeFileSync(join(vaultDir, 'wiki', `${id}.md`), `# ${id}\n`)
}

/** 볼트를 만들고 그래프가 구면 자리에 오를 때까지 */
const openSettledGraph = async (
  launch: (prefix: string) => Promise<{ page: Page; vaultDir: string }>,
  prefix: string,
  theme: 'light' | 'dark'
): Promise<{ page: Page; canvas: Locator }> => {
  const { page, vaultDir } = await launch(prefix)
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  await page.getByTestId(`theme-${theme}`).click()
  seedWiki(vaultDir)
  await goTo(page, 'graph')
  const canvas = page.getByTestId('graph-canvas')
  // 그래프는 보관함 전체를 담아 템플릿 문서도 점이 된다 — 개수는 템플릿 따라 바뀌니 시드 43개가 들어왔는지만 본다
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-node-count')), { timeout: 30000 })
    .toBeGreaterThanOrEqual(43)
  await expect(canvas).toHaveAttribute('data-settled', '1', { timeout: 90000 })
  await expect(canvas).toHaveAttribute('data-growth', 'idle')
  // 기본 화면이 성장의 끝 모습이다 — 오브·궤도 링이 재생 전부터 떠 있다
  await expect(canvas).toHaveAttribute('data-stage', '1')
  // 멎은 뒤 점 자리 지문(data-layout)이 찍히면 전체 보기 예약까지 끝났다 — 고정 1.5초 대신 탐침을 본다
  await expect.poll(() => canvas.getAttribute('data-layout')).not.toBeNull()
  return { page, canvas }
}

const born = async (canvas: Locator): Promise<number> =>
  Number((await canvas.getAttribute('data-growth-born')) ?? 0)

test('성장 재생 — 멈추면 구면 그대로, 드래그·휠에도 성장은 계속된다', async ({ launch }) => {
  const { page, canvas } = await openSettledGraph(launch, 'graph-growth-e2e', 'light')
  const button = page.getByTestId('graph-growth')
  const layout = await canvas.getAttribute('data-layout')

  // 기본 자리는 결정적이다 — 다시 그려도 같은 구면
  await page.getByTestId('graph-refresh').click()
  await expect(canvas).toHaveAttribute('data-settled', '1', { timeout: 30000 })
  await expect.poll(() => canvas.getAttribute('data-layout')).toBe(layout)

  await button.click()
  await expect(canvas).toHaveAttribute('data-growth', 'playing')
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => born(canvas)).toBeGreaterThanOrEqual(1)
  // 멈추기 전 재생이 앞으로 갔는지 — 고정 2초 대신 태어난 점이 하나 더 늘 때까지
  await expect.poll(() => born(canvas), { timeout: 15000 }).toBeGreaterThanOrEqual(2)

  // 재생 중 누르면 멈추고, 점은 구면 제자리에 선다(점 좌표 지문이 재생 전과 같다 — 화면 좌표는 60초 뒤 자동 회전에 흔들린다)
  await button.click()
  await expect(canvas).toHaveAttribute('data-growth', 'idle')
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => canvas.getAttribute('data-layout')).toBe(layout)
  // 연출은 자리를 다시 계산한 것으로 세지 않는다
  await expect(canvas).toHaveAttribute('data-reheats', '0')

  // 다시 누르면 처음부터 — 드래그·휠을 해도 성장 시계는 멈추지 않는다
  await button.click()
  await expect(canvas).toHaveAttribute('data-growth', 'playing')
  await expect.poll(() => born(canvas)).toBeGreaterThanOrEqual(1)
  expect(await born(canvas)).toBeLessThan(5)
  // 드래그 전에 재생이 앞으로 갔는지 — 고정 4초 대신 태어난 점이 늘 때까지
  const beforeDrag = await born(canvas)
  await expect.poll(() => born(canvas), { timeout: 15000 }).toBeGreaterThan(beforeDrag)
  const box = (await canvas.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 120, cy + 40, { steps: 10 })
  await page.mouse.up()
  await page.mouse.wheel(0, -300)
  const afterTouch = await born(canvas)
  await expect.poll(() => born(canvas), { timeout: 10000 }).toBeGreaterThan(afterTouch)
  await expect(canvas).toHaveAttribute('data-growth', 'playing')

  await button.click()
  await expect(canvas).toHaveAttribute('data-growth', 'idle')
  await expect(canvas).toHaveAttribute('data-reheats', '0')
})

test('성장 재생 — 움직임 줄이기에서도 자라고, 멈추면 구면 그대로다', async ({ launch }) => {
  const { page, canvas } = await openSettledGraph(launch, 'graph-growth-reduced-e2e', 'light')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const layout = await canvas.getAttribute('data-layout')
  const button = page.getByTestId('graph-growth')

  await button.click()
  await expect(canvas).toHaveAttribute('data-growth', 'playing')
  // 점은 움직이지 않고 제자리에 나타나기만 한다 — 그래도 하나에서 여럿으로 는다
  await expect.poll(() => born(canvas), { timeout: 15000 }).toBeGreaterThan(1)

  await button.click()
  await expect(canvas).toHaveAttribute('data-growth', 'idle')
  await expect.poll(() => canvas.getAttribute('data-layout')).toBe(layout)
  await expect(canvas).toHaveAttribute('data-reheats', '0')
})

for (const theme of ['light', 'dark'] as const) {
  test(`성장 재생 — ${theme} 무대에서 끝까지 자라 기본 화면과 같은 구면에 선다`, async ({
    launch
  }) => {
    const { page, canvas } = await openSettledGraph(launch, `graph-growth-${theme}-e2e`, theme)
    const dir = process.env['GRAPH_GROWTH_SHOT_DIR']
    const shot = async (name: string): Promise<void> => {
      if (dir) await canvas.screenshot({ path: join(dir, `growth-${theme}-${name}.png`) })
    }
    const layout = await canvas.getAttribute('data-layout')
    await shot('0-before')

    const started = Date.now()
    const at = async (seconds: number): Promise<void> => {
      const wait = started + seconds * 1000 - Date.now()
      if (wait > 0) await page.waitForTimeout(wait)
    }
    await page.getByTestId('graph-growth').click()
    await at(1)
    await shot('1-start')
    await at(7)
    await shot('2-middle')
    await at(14)
    // 마지막 점까지 다 태어났다 — 이어진 점 40 + 외톨이 3 + 시스템 페이지
    expect(await born(canvas)).toBe(Number(await canvas.getAttribute('data-node-count')))
    await shot('3-end')

    await expect(canvas).toHaveAttribute('data-growth', 'idle', { timeout: 10000 })
    await expect.poll(() => canvas.getAttribute('data-layout')).toBe(layout)
    await expect(canvas).toHaveAttribute('data-stage', '1')
    // 끝까지 간 연출도 자리를 다시 계산한 것으로 세지 않는다
    await expect(canvas).toHaveAttribute('data-reheats', '0')
    await shot('4-restored')
  })
}
