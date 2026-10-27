import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { hwpxText } from './hwpx-text'
import { CLIP_TEXT_LIMIT, ZIP_INFLATE_LIMIT } from './clip-text'
import { mainT } from '../i18n'

// 픽스처는 여기서 만든다 — 실물 한글 문서는 개인·고객사 정보라 커밋하지 않는다.
// 태그 구조는 2026-09-17 실물(section0.xml)에서 확인한 것: hp:p > hp:run > hp:t, hp:tbl > hp:tr > hp:tc > hp:subList > hp:p
const HP =
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
const section = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec ${HP}>${body}</hs:sec>`
const p = (...runs: string[]): string =>
  `<hp:p id="1" paraPrIDRef="0">${runs.map((t) => `<hp:run charPrIDRef="0">${t}</hp:run>`).join('')}</hp:p>`
const t = (text: string): string => `<hp:t>${text}</hp:t>`

const tbl = (rows: string[][]): string =>
  `<hp:tbl id="9" rowCnt="${rows.length}" colCnt="${rows[0].length}">${rows
    .map(
      (cells) =>
        `<hp:tr>${cells
          .map(
            (cell) =>
              `<hp:tc><hp:cellAddr colAddr="0" rowAddr="0"/><hp:subList>${p(t(cell))}</hp:subList></hp:tc>`
          )
          .join('')}</hp:tr>`
    )
    .join('')}</hp:tbl>`

const write = (dir: string, files: Record<string, string>): string => {
  const path = join(dir, 'doc.hwpx')
  const entries: Record<string, Uint8Array> = {}
  for (const [name, body] of Object.entries(files)) entries[name] = strToU8(body)
  writeFileSync(path, zipSync(entries))
  return path
}

const hwpx = (dir: string, sections: string[], extra: Record<string, string> = {}): string => {
  const files: Record<string, string> = { mimetype: 'application/hwp+zip', ...extra }
  sections.forEach((body, i) => {
    files[`Contents/section${i}.xml`] = section(body)
  })
  return write(dir, files)
}

describe('hwpxText', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hwpx-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('문단은 한 줄씩, 한 문단의 run 여러 개는 이어 붙인다', async () => {
    const path = hwpx(dir, [p(t('첫째 '), t('문단')) + p(t('둘째 문단'))])
    const { text } = await hwpxText(path)
    expect(text).toBe('첫째 문단\n\n둘째 문단')
  })

  it('탭·줄바꿈 요소가 글자를 삼키지 않는다', async () => {
    const path = hwpx(dir, [p('<hp:t>앞<hp:tab/>뒤<hp:lineBreak/>다음</hp:t>')])
    const { text } = await hwpxText(path)
    expect(text).toBe('앞 뒤\n다음')
  })

  it('표는 GFM 표로, 셀 안 문단은 본문 문단으로 새지 않는다', async () => {
    const path = hwpx(dir, [
      p(t('제목')) +
        p(
          tbl([
            ['품목', '수량'],
            ['맥북프로', '1']
          ])
        ) +
        p(t('끝'))
    ])
    const { text } = await hwpxText(path)
    expect(text).toBe('제목\n\n| 품목 | 수량 |\n| --- | --- |\n| 맥북프로 | 1 |\n\n끝')
    expect(text.match(/맥북프로/g)).toHaveLength(1)
  })

  it('병합 칸은 colSpan 만큼 빈 칸을 채워 열이 밀리지 않고, 행 없는 표는 넣지 않는다', async () => {
    const merged =
      `<hp:tbl id="9" rowCnt="2" colCnt="3"><hp:tr>` +
      `<hp:tc><hp:cellSpan colSpan="3" rowSpan="1"/><hp:subList>${p(t('제목 칸'))}</hp:subList></hp:tc>` +
      `</hp:tr><hp:tr>` +
      ['a', 'b', 'c']
        .map(
          (c) =>
            `<hp:tc><hp:cellSpan colSpan="1" rowSpan="1"/><hp:subList>${p(t(c))}</hp:subList></hp:tc>`
        )
        .join('') +
      `</hp:tr></hp:tbl>`
    const path = hwpx(dir, [p(merged) + p('<hp:tbl id="10" rowCnt="0" colCnt="0"/>') + p(t('끝'))])
    const { text } = await hwpxText(path)
    expect(text).toBe('| 제목 칸 |  |  |\n| --- | --- | --- |\n| a | b | c |\n\n끝')
  })

  it('터무니없는 colSpan 은 상한에서 잘라 메모리를 잡지 않는다', async () => {
    const huge =
      `<hp:tbl id="9" rowCnt="1" colCnt="1"><hp:tr><hp:tc><hp:cellSpan colSpan="2000000000" rowSpan="1"/>` +
      `<hp:subList>${p(t('x'))}</hp:subList></hp:tc></hp:tr></hp:tbl>`
    const { text } = await hwpxText(hwpx(dir, [p(huge)]))
    expect(text.split('\n')[0].split('|').length).toBeLessThanOrEqual(66)
  })

  it('DOCTYPE 이 든 본문은 엔티티를 펼치지 않고 던진다', async () => {
    const bomb = `<!DOCTYPE hs [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>`
    const path = write(dir, {
      mimetype: 'application/hwp+zip',
      'Contents/section0.xml': bomb + section(p(t('&b;')))
    })
    await expect(hwpxText(path)).rejects.toThrow(/DOCTYPE/)
  })

  it('본문 XML 이 상한을 넘으면 풀지 않고 던진다', async () => {
    const path = hwpx(dir, [p(t('x'.repeat(ZIP_INFLATE_LIMIT + 1)))])
    await expect(hwpxText(path)).rejects.toThrow(mainT().clipMain.zipTooLarge)
  })

  it('그림은 [IMAGE] 자리만 남기고 개수를 센다', async () => {
    const path = hwpx(dir, [
      p('<hp:pic id="1"><hp:img binaryItemIDRef="image1"/></hp:pic>') + p(t('설명'))
    ])
    const result = await hwpxText(path)
    expect(result).toEqual({ text: '[IMAGE]\n\n설명', images: 1 })
  })

  it('섹션은 번호 순서로 잇고 BinData 는 풀지 않는다', async () => {
    const path = hwpx(dir, [p(t('첫 섹션')), p(t('둘째 섹션'))], {
      'BinData/image1.png': 'not really a png'
    })
    const { text } = await hwpxText(path)
    expect(text).toBe('첫 섹션\n\n둘째 섹션')
  })

  it('zip 이 아니거나 섹션이 없으면 던진다', async () => {
    const notZip = join(dir, 'broken.hwpx')
    writeFileSync(notZip, 'not a zip')
    await expect(hwpxText(notZip)).rejects.toThrow()
    const noSection = write(dir, { mimetype: 'application/hwp+zip', 'settings.xml': '<x/>' })
    await expect(hwpxText(noSection)).rejects.toThrow(/section/)
  })

  it('긴 문서는 PDF 와 같은 상한에서 자르고 같은 문장을 붙인다', async () => {
    const path = hwpx(dir, [p(t('가'.repeat(CLIP_TEXT_LIMIT + 10)))])
    const { text } = await hwpxText(path)
    expect(text.startsWith('가'.repeat(CLIP_TEXT_LIMIT))).toBe(true)
    expect(text).toContain('(이 문서는 너무 길어 앞부분만 옮겼다 — 전체는 원본 파일에 그대로 있다)')
    expect(text.length).toBeLessThan(CLIP_TEXT_LIMIT + 100)
  })
})
