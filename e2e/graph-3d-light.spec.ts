import { type Locator } from '@playwright/test'
import { expect, test } from './fixtures'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo } from './helpers'

test.setTimeout(180000)

/**
 * 스크린샷에서 바탕색과 뚜렷이 다른 화소 수 — "점이 보인다" 를 수로 잰다.
 * PNG 는 브라우저가 풀게 한다(pngjs 없이). 바탕과 채널 최대 차이가 60 미만이면 안 보이는 것으로 친다
 */
const inkPixels = async (canvas: Locator, bg: [number, number, number]): Promise<number> => {
  const png = (await canvas.screenshot()).toString('base64')
  return canvas.page().evaluate(
    async ({ png, bg }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${png}`
      await img.decode()
      const off = document.createElement('canvas')
      off.width = img.width
      off.height = img.height
      const ctx = off.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, off.width, off.height)
      let ink = 0
      for (let i = 0; i < data.length; i += 4) {
        const diff = Math.max(
          Math.abs(data[i] - bg[0]),
          Math.abs(data[i + 1] - bg[1]),
          Math.abs(data[i + 2] - bg[2])
        )
        if (diff >= 60) ink += 1
      }
      return ink
    },
    { png, bg }
  )
}

test('Graph 3D — 라이트 모드에서도 전체 보기에서 점이 바탕에 묻히지 않는다', async ({ launch }) => {
  const { page, vaultDir } = await launch('graph-3d-light-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  await page.getByTestId('theme-light').click()

  // 스크린샷(페이지 232·링크 1758) 규모로 — 안개·카메라 거리는 그래프 크기에 달려 있다
  mkdirSync(join(vaultDir, 'wiki'), { recursive: true })
  const N = 200
  for (let i = 0; i < N; i++) {
    const links = Array.from({ length: 6 }, (_, k) => `[[p${(i * 7 + k * 13) % N}]]`)
    writeFileSync(join(vaultDir, 'wiki', `p${i}.md`), `# P${i}\n\n${links.join(' ')}\n`)
  }

  await goTo(page, 'graph')
  const canvas = page.getByTestId('graph-canvas')
  // 시스템 페이지(INDEX 등) 몇 개가 더 붙는다 — 만든 수 이상이면 다 읽힌 것이다
  await expect(canvas).toHaveAttribute('data-node-count', /^2\d\d$/, { timeout: 30000 })
  await expect(canvas.locator('canvas').first()).toBeVisible()
  await expect(canvas).toHaveAttribute('data-settled', '1', { timeout: 90000 })
  // 멎은 뒤 점 자리 지문(data-layout)이 찍히면 탐침도 fresh — 고정 1.5초 대신 지문을 본다
  await expect.poll(() => canvas.getAttribute('data-layout')).not.toBeNull()

  const ink = await inkPixels(canvas, [0xff, 0xff, 0xff])
  if (process.env['GRAPH_3D_SHOT']) await canvas.screenshot({ path: process.env['GRAPH_3D_SHOT'] })
  // 점 하나가 화면에서 몇 화소는 차지한다 — 점 수의 몇 배도 안 나오면 그림이 지워진 것이다
  expect(ink, `바탕과 구별되는 화소 ${ink}개`).toBeGreaterThan(N * 4)
})
