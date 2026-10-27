import { expect, test } from './fixtures'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { goTo } from './helpers'
import { aP, docx, pptx, pSp, wP, xlsx } from '../src/main/clip/office-fixture.test-util'
import { writeHwp } from '../src/main/clip/hwp-fixture.test-util'

type ClipApi = {
  api: {
    clipFile(path: string): Promise<{ ok: true; path: string } | { ok: false; reason: string }>
  }
}

// 형식마다 main 의 변환 라이브러리가 다르다(pdfjs·mammoth·read-excel-file·hwpxjs·fast-xml-parser) —
// 패키징된 앱(E2E_APP_EXECUTABLE)으로 돌리면 electron-builder files 제외가 그중 하나를 빼먹지 않았는지 본다
test('PDF·워드·엑셀·파워포인트·한글 문서를 넣으면 글자를 뽑아 자료로 담는다', async ({
  launch
}) => {
  const { page, root, vaultDir } = await launch('clip-formats-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  const hwpx = join(root, '확인서.hwpx')
  writeFileSync(
    hwpx,
    zipSync({
      mimetype: strToU8('application/hwp+zip'),
      'Contents/section0.xml': strToU8(
        '<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"><hp:p><hp:run><hp:t>한글 확인서 본문</hp:t></hp:run></hp:p></hs:sec>'
      )
    })
  )
  const pdf = join(root, 'paper.pdf')
  copyFileSync(resolve('test/fixtures/pdf/sample.pdf'), pdf)
  const cases: Array<[string, string]> = [
    [pdf, 'PDF PREVIEW OK'],
    [docx(root, '보고서.docx', wP('워드 보고서 본문')), '워드 보고서 본문'],
    [
      xlsx(root, '정산.xlsx', {
        시트: [
          ['항목', '금액'],
          ['엑셀 정산 행', 1200]
        ]
      }),
      '엑셀 정산 행'
    ],
    [pptx(root, '발표.pptx', [pSp([aP('발표 슬라이드 본문')])]), '발표 슬라이드 본문'],
    [writeHwp(root, '공문.hwp', ['한글 공문 본문']), '한글 공문 본문'],
    [hwpx, '한글 확인서 본문']
  ]

  for (const [src, text] of cases) {
    const result = await page.evaluate(
      (path) => (window as unknown as ClipApi).api.clipFile(path),
      src
    )
    expect(result, src).toMatchObject({ ok: true })
    if (!result.ok) continue
    const saved = isAbsolute(result.path) ? result.path : join(vaultDir, result.path)
    expect(readFileSync(saved, 'utf8'), src).toContain(text)
  }
})
