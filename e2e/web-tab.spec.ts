// 웹 탭 — 문서 자리 탭에 웹 페이지를 띄운다. 페이지는 main 의 WebContentsView 라 Playwright 의 page 로 잡히지
// 않을 수 있다 — 페이지 쪽 상태(주소·보임)는 `webViews`(main 조회)로 잰다.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'
import { goTo, openDoc, openWebTab, webClick, webViews } from './helpers'
import type { Page } from '@playwright/test'

const html = (title: string, body: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`

/** 보관함을 만들고 문서 자리로 — 빈 탭 단추는 문서 자리에 있다 */
const ready = async (page: Page): Promise<void> => {
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await goTo(page, 'wiki')
}

test('s01 새 탭에서 웹 페이지를 열면 앱 안에 뜨고 탭 이름이 페이지 제목이 된다', async ({
  launch,
  serve
}) => {
  test.setTimeout(120000)
  const port = await serve((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(html('테스트 페이지', '<h1>안녕</h1>'))
  })
  const url = `http://127.0.0.1:${port}/`
  const { app, page } = await launch('web-tab-s01')
  await ready(page)

  await openWebTab(page, url)
  await expect(page.getByTestId('doc-tab').last()).toHaveText('테스트 페이지')
  await expect.poll(() => webViews(app)).toEqual([{ url, visible: true }])

  // 다른 탭으로 가면 숨고, 돌아오면 다시 보인다
  await page.getByTestId('doc-tab').first().click()
  await expect.poll(() => webViews(app)).toEqual([{ url, visible: false }])
  await page.getByTestId('doc-tab').last().click()
  await expect.poll(() => webViews(app)).toEqual([{ url, visible: true }])

  // 탭을 닫으면 view 가 파기된다
  await page.getByTestId('doc-tab-close').last().click()
  await expect.poll(() => webViews(app)).toEqual([])
})

test('s02 뒤로 가면 앞 페이지로, 못 여는 주소는 실패 문구, 새 창 링크는 새 웹 탭', async ({
  launch,
  serve
}) => {
  test.setTimeout(120000)
  const port = await serve((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    if (req.url === '/two') res.end(html('둘째', '<p>둘</p>'))
    else if (req.url === '/three') res.end(html('셋째', '<p>셋</p>'))
    else
      res.end(
        html(
          '첫째',
          '<a id="next" href="/two">다음</a> <a id="pop" href="/three" target="_blank">새 창</a>'
        )
      )
  })
  const base = `http://127.0.0.1:${port}/`
  const { app, page } = await launch('web-tab-s02')
  await ready(page)
  const tabs = page.getByTestId('doc-tab')

  await openWebTab(page, base)
  await expect(tabs.last()).toHaveText('첫째')
  await expect(page.getByTestId('web-back')).toBeDisabled()

  // 페이지 안 링크로 옮긴 뒤 뒤로
  await webClick(app, '#next')
  await expect(tabs.last()).toHaveText('둘째')
  await page.getByTestId('web-back').click()
  await expect(tabs.last()).toHaveText('첫째')
  await expect(page.getByTestId('web-forward')).toBeEnabled()

  // target=_blank 는 새 창 대신 새 웹 탭
  const count = await tabs.count()
  await webClick(app, '#pop')
  await expect(tabs).toHaveCount(count + 1)
  await expect(tabs.last()).toHaveText('셋째')
  await expect.poll(() => webViews(app)).toHaveLength(2)

  // 아무도 받지 않는 주소 — 실패 문구가 보이고 view 는 숨는다
  const address = page.getByTestId('web-address')
  await address.fill('http://127.0.0.1:1/')
  await address.press('Enter')
  await expect(page.getByTestId('web-error')).toContainText('페이지를 열지 못했어요')
  await expect.poll(async () => (await webViews(app)).some((v) => v.visible)).toBe(false)
})

test('s03 담기 — 스크립트가 그린 글까지 자료로 담긴다', async ({ launch, serve }) => {
  test.setTimeout(120000)
  const port = await serve((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(
      html(
        '그린 페이지',
        '<article><h1>그린 페이지</h1><p id="x"></p></article>' +
          '<script>document.getElementById("x").textContent = "스크립트가 쓴 본문 문장이에요. ".repeat(20)</script>'
      )
    )
  })
  const url = `http://127.0.0.1:${port}/`
  const { page, vaultDir } = await launch('web-tab-s03')
  await ready(page)
  await openWebTab(page, url)
  await expect(page.getByTestId('doc-tab').last()).toHaveText('그린 페이지')

  const clippings = join(vaultDir, 'Clippings')
  const before = new Set(readdirSync(clippings))
  await page.getByTestId('web-clip').click()
  await expect(page.getByTestId('web-clip-note')).toContainText('자료에 담았어요')

  const names = readdirSync(clippings).filter((name) => !before.has(name))
  expect(names).toHaveLength(1)
  const text = readFileSync(join(clippings, names[0]), 'utf8')
  expect(text.split('\n')).toContainEqual(
    expect.stringMatching(/^source: "?http:\/\/127\.0\.0\.1:/)
  )
  expect(text).toContain(url)
  expect(text).toContain('스크립트가 쓴 본문 문장이에요')

  // 열기 — 담은 자료가 미리보기로 뜬다
  await page.getByTestId('web-clip-open').click()
  await expect(page.getByTestId('doc-tab').last()).toHaveText(names[0].replace(/\.md$/, ''))
})

test('s04 리더 본문의 http 링크는 읽던 탭을 두고 새 웹 탭으로 열린다', async ({
  launch,
  serve
}) => {
  test.setTimeout(120000)
  const port = await serve((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(html('링크 끝', '<p>왔다</p>'))
  })
  const url = `http://127.0.0.1:${port}/`
  const { app, page, vaultDir } = await launch('web-tab-s04')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'links.md'), `# 링크 모음\n\n[바깥 글](${url})\n`)
  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/links.md')
  const tabs = page.getByTestId('doc-tab')
  const count = await tabs.count()

  await page.locator(`a[href="${url}"]`).first().click()
  await expect(tabs).toHaveCount(count + 1)
  await expect(tabs.last()).toHaveText('링크 끝')
  await expect.poll(() => webViews(app)).toEqual([{ url, visible: true }])
  // 읽던 문서 탭은 그대로 남는다
  await expect(tabs.nth(count - 1)).toHaveText('links')
})

test('s05 팔레트가 열리면 웹 페이지는 숨고 닫으면 다시 보인다', async ({ launch, serve }) => {
  test.setTimeout(120000)
  const port = await serve((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(html('덮개', '<h1>밑에 깔린 페이지</h1>'))
  })
  const url = `http://127.0.0.1:${port}/`
  const { app, page } = await launch('web-tab-s05')
  await ready(page)
  await openWebTab(page, url)
  await expect(page.getByTestId('doc-tab').last()).toHaveText('덮개')
  await expect.poll(() => webViews(app)).toEqual([{ url, visible: true }])

  // 페이지는 앱 화면 위에 따로 뜬다 — 팔레트가 그 밑에 깔리지 않게 숨기고, 숨긴 자리에는 마지막 모습을 깐다
  await page.keyboard.press('ControlOrMeta+KeyK')
  await expect(page.getByTestId('palette-input')).toBeVisible()
  await expect.poll(() => webViews(app)).toEqual([{ url, visible: false }])
  await expect(page.getByTestId('web-cover')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('palette-input')).toBeHidden()
  await expect.poll(() => webViews(app)).toEqual([{ url, visible: true }])
  await expect(page.getByTestId('web-cover')).toBeHidden()
})
