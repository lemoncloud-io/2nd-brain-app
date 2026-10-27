import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { xlsxText } from './xlsx-text'
import { CLIP_TEXT_LIMIT, ZIP_INFLATE_LIMIT } from './clip-text'
import { xlsx, type XCell as Cell } from './office-fixture.test-util'
import { mainT } from '../i18n'

describe('xlsxText', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xlsx-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('시트마다 제목과 GFM 표, 빈 시트는 건너뛴다. 숫자·날짜·빈 칸·세로줄을 글자로 옮긴다', async () => {
    const path = xlsx(dir, 'a.xlsx', {
      품의: [
        ['품목', '수량', '일자'],
        ['맥북프로', 1, { date: 45481 }],
        ['모니터|27', 2, null]
      ],
      빈시트: [],
      비고: [['메모'], ['둘째 시트']]
    })
    expect(await xlsxText(path)).toBe(
      [
        '## 품의',
        '',
        '| 품목 | 수량 | 일자 |',
        '| --- | --- | --- |',
        '| 맥북프로 | 1 | 2024-07-08 |',
        '| 모니터\\|27 | 2 |  |',
        '',
        '## 비고',
        '',
        '| 메모 |',
        '| --- |',
        '| 둘째 시트 |'
      ].join('\n')
    )
  })

  it('모든 시트가 비었으면 빈 글자다', async () => {
    const path = xlsx(dir, 'empty.xlsx', { Sheet1: [] })
    expect(await xlsxText(path)).toBe('')
  })

  it('상한은 행 경계에서 자르고 몇 행을 옮겼는지 적는다 — 모든 행의 칸 수가 헤더와 같다', async () => {
    const wide = 'x'.repeat(1000)
    const rows: Cell[][] = [['a', 'b'], ...Array.from({ length: 200 }, (_, i) => [`${i}`, wide])]
    const path = xlsx(dir, 'long.xlsx', { 목록: rows })
    const text = await xlsxText(path)
    expect(text.length).toBeLessThanOrEqual(CLIP_TEXT_LIMIT + 200)
    const lines = text.split('\n').filter((l) => l.startsWith('|'))
    expect(lines.length).toBeLessThan(rows.length + 2)
    expect(lines.length).toBeGreaterThan(50)
    for (const line of lines) expect(line.split('|').length).toBe(lines[0].split('|').length)
    expect(text).toMatch(/\(앞 \d+행만 옮겼다 — 전체는 원본 파일에 그대로 있다\)$/)
  })

  it('헤더만 있는 시트가 상한을 넘어도 잘림 문장으로 끝나고 상한 안이다', async () => {
    const sheets: Record<string, Cell[][]> = {}
    for (let i = 0; i < 300; i += 1) sheets[`s${i}`] = [['h'.repeat(1000)]]
    const text = await xlsxText(xlsx(dir, 'heads.xlsx', sheets))
    expect(text.length).toBeLessThanOrEqual(CLIP_TEXT_LIMIT + 200)
    expect(text).toMatch(/뒤 시트 \d+개는 옮기지 못했다/)
  })

  it('풀었을 때 상한을 넘는 통합문서는 풀지 않고 던진다', async () => {
    const path = xlsx(dir, 'bomb.xlsx', { big: [['x'.repeat(ZIP_INFLATE_LIMIT + 1)]] })
    await expect(xlsxText(path)).rejects.toThrow(mainT().clipMain.zipTooLarge)
  })

  it('시트 이름의 줄바꿈은 접고, 남은 시트 수는 빈 시트를 세지 않는다', async () => {
    const wide = 'x'.repeat(CLIP_TEXT_LIMIT)
    const path = xlsx(dir, 'names.xlsx', {
      '앞&#10;시트': [['h'], [wide]],
      빈1: [],
      빈2: [],
      뒤: [['h'], ['v']]
    })
    const text = await xlsxText(path)
    expect(text.startsWith('## 앞 시트\n')).toBe(true)
    expect(text).toMatch(/뒤 시트 1개는 옮기지 못했다/)
  })

  it('xlsx 가 아니면 던진다', async () => {
    const path = join(dir, 'broken.xlsx')
    writeFileSync(path, 'not a workbook')
    await expect(xlsxText(path)).rejects.toThrow()
  })
})
