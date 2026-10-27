// HWPX(OWPML, zip + XML) → 글자. PDF 와 같은 자리 — 위키화 에이전트는 Clippings 의 markdown 을 읽는다.
// 태그 구조는 2026-09-17 실물 문서에서 확인했다: hs:sec > hp:p > hp:run > hp:t 가 문단,
// hp:tbl > hp:tr > hp:tc > hp:subList > hp:p 가 표(hp:tc > hp:cellSpan 의 colSpan 이 병합 칸), hp:pic 이 그림.
// 그 밖의 요소(문단 모양·줄 배치)는 글자가 없다.
import { readFile } from 'node:fs/promises'
import { strFromU8 } from 'fflate'
import {
  capText,
  clampInt,
  gfmCell,
  gfmTable,
  imageMark,
  MAX_COL_SPAN,
  unzipWithin
} from './clip-text'
import { attrOf, childrenOf, parseXml, tagOf, type XmlNode as Node } from './xml-tree'

const SECTION = /^Contents\/section(\d+)\.xml$/

/** hp:t 안 — 글자와 탭·줄바꿈만 */
const runText = (nodes: Node[]): string =>
  nodes
    .map((node) => {
      const tag = tagOf(node)
      if (tag === '#text') return String(node['#text'])
      if (tag === 'hp:tab') return ' '
      if (tag === 'hp:lineBreak') return '\n'
      return runText(childrenOf(node, tag))
    })
    .join('')

type Walk = { blocks: string[]; images: number }

/** 문단 하나 — 글자는 한 블록으로, 안에 든 표·그림은 그 자리에서 별도 블록으로 */
const paragraph = (node: Node, out: Walk): void => {
  let text = ''
  const flush = (): void => {
    if (text.trim()) out.blocks.push(text.trim())
    text = ''
  }
  for (const run of childrenOf(node, 'hp:p')) {
    for (const item of childrenOf(run, 'hp:run')) {
      const tag = tagOf(item)
      if (tag === 'hp:t') text += runText(childrenOf(item, 'hp:t'))
      else if (tag === 'hp:tbl') {
        flush()
        const rows = table(item, out)
        if (rows.length > 0) out.blocks.push(gfmTable(rows))
      } else if (tag === 'hp:pic') {
        flush()
        out.images += 1
        out.blocks.push(imageMark())
      }
    }
  }
  flush()
}

/** 셀 하나 — 병합 칸(colSpan)은 그만큼 빈 칸을 뒤에 붙여 열이 밀리지 않게 한다 */
const cells = (tc: Node, out: Walk): string[] => {
  const inner: Walk = { blocks: [], images: 0 }
  let span = 1
  for (const child of childrenOf(tc, 'hp:tc')) {
    const tag = tagOf(child)
    // 속성값은 외부 입력이다 — 거대한 colSpan 하나가 배열 할당으로 main 을 죽이지 않게 자른다
    if (tag === 'hp:cellSpan') span = clampInt(attrOf(child, 'colSpan'), 1, MAX_COL_SPAN)
    if (tag !== 'hp:subList') continue
    for (const p of childrenOf(child, 'hp:subList')) if (tagOf(p) === 'hp:p') paragraph(p, inner)
  }
  out.images += inner.images
  return [gfmCell(inner.blocks.join(' ')), ...Array.from({ length: span - 1 }, () => '')]
}

const table = (node: Node, out: Walk): string[][] =>
  childrenOf(node, 'hp:tbl')
    .filter((row) => tagOf(row) === 'hp:tr')
    .map((row) =>
      childrenOf(row, 'hp:tr')
        .filter((tc) => tagOf(tc) === 'hp:tc')
        .flatMap((tc) => cells(tc, out))
    )
    .filter((row) => row.length > 0)

export const hwpxText = async (path: string): Promise<{ text: string; images: number }> => {
  // 그림(BinData/)은 수 MB 라 풀지 않는다 — 본문 섹션만, 그것도 상한까지만
  const files = unzipWithin(new Uint8Array(await readFile(path)), (name) => SECTION.test(name))
  const sections = Object.keys(files)
    .map((name) => ({ name, n: Number(SECTION.exec(name)![1]) }))
    .sort((a, b) => a.n - b.n)
  if (sections.length === 0) throw new Error('HWPX has no body section')
  const out: Walk = { blocks: [], images: 0 }
  for (const { name } of sections) {
    const root = parseXml(strFromU8(files[name]), 'HWPX body')
    const sec = root.find((node) => tagOf(node) === 'hs:sec')
    for (const node of sec ? childrenOf(sec, 'hs:sec') : []) {
      if (tagOf(node) === 'hp:p') paragraph(node, out)
    }
  }
  return { text: capText(out.blocks.join('\n\n')), images: out.images }
}
