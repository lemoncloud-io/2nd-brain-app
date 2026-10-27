// xlsx → 글자. 시트마다 `## 시트명` + GFM 표 — 위키화 에이전트는 Clippings 의 markdown 을 읽는다.
// read-excel-file 은 읽기 전용 순수 JS 다(SheetJS 는 npm 판이 CVE 미수정이라 쓰지 않는다).
import { readFile } from 'node:fs/promises'
import readXlsxFile from 'read-excel-file/node'
import type { CellValue } from 'read-excel-file/node'
import { assertZipWithin, capText, CLIP_TEXT_LIMIT, gfmCell, gfmRow } from './clip-text'

const cell = (value: CellValue | null): string => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return gfmCell(String(value))
}

// ui-hangul-ignore: 보관함에 남는 자료 본문 끝 표식(D8)
const cutNote = (kept: number, sheetsLeft: number): string =>
  `(앞 ${kept}행만 옮겼다${sheetsLeft > 0 ? `, 뒤 시트 ${sheetsLeft}개는 옮기지 못했다` : ''} — 전체는 원본 파일에 그대로 있다)`

export const xlsxText = async (path: string): Promise<string> => {
  const data = await readFile(path)
  // 사용자가 받아 온 임의 zip — 풀기 전에 선언 크기부터 본다
  assertZipWithin(new Uint8Array(data))
  const sheets = await readXlsxFile(data)
  const filled = sheets
    .map(({ sheet, data: sheetData }) => ({ sheet, rows: sheetData.map((r) => r.map(cell)) }))
    .filter(({ rows }) => rows.some((r) => r.some((c) => c !== '')))
  const blocks: string[] = []
  let length = 0
  for (const [index, { sheet, rows }] of filled.entries()) {
    const width = Math.max(...rows.map((r) => r.length))
    const head = [
      // ui-hangul-ignore: 보관함에 남는 자료 본문 제목(D8)
      `## ${gfmCell(sheet) || '시트'}`,
      '',
      gfmRow(rows[0], width),
      gfmRow(Array(width).fill('---'), width)
    ]
    const sheetsLeft = filled.length - index - 1
    // 상한은 행 경계에서 — 표 한가운데를 자르면 md 표가 깨져 위키화 에이전트가 표 전체를 못 읽는다
    if (length + head.join('\n').length > CLIP_TEXT_LIMIT) {
      blocks.push(cutNote(0, sheetsLeft + 1))
      break
    }
    const lines = [...head]
    length += head.join('\n').length + 2
    let kept = 0
    let cut = false
    for (const r of rows.slice(1)) {
      const line = gfmRow(r, width)
      if (length + line.length + 1 > CLIP_TEXT_LIMIT) {
        lines.push('', cutNote(kept, sheetsLeft))
        cut = true
        break
      }
      lines.push(line)
      length += line.length + 1
      kept += 1
    }
    blocks.push(lines.join('\n'))
    if (cut) break
  }
  // 행 경계 계산이 어긋나도 상한 자체는 지킨다
  return capText(blocks.join('\n\n'))
}
