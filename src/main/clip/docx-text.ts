// .docx → markdown. mammoth(BSD-2)가 Word 문서를 HTML 로 바꾸고 turndown 이 markdown 으로 옮긴다 —
// mammoth 의 markdown 출력은 표를 풀어 버려서, 표는 HTML 에서 직접 gfmTable 로 쓴다.
import { readFile } from 'node:fs/promises'
import { strFromU8, zipSync } from 'fflate'
import mammoth from 'mammoth'
import TurndownService from 'turndown'
import {
  capText,
  clampInt,
  CLIP_CUT_NOTE,
  CLIP_TEXT_LIMIT,
  gfmCell,
  gfmTable,
  imageMark,
  MAX_COL_SPAN,
  MAX_TABLE_COLUMNS,
  unzipWithin
} from './clip-text'
import { assertNoDoctype } from './xml-tree'

/**
 * 그림·포함 개체·글꼴 — mammoth 가 열지 않으므로(그림은 아래 convertImage 가 읽지 않는다) 풀지도 세지도 않는다.
 * 사진·글꼴을 품은 문서가 압축 상한에 걸리지 않게 하려는 것이다. 나머지는 이름과 무관하게 전부 잰다 —
 * mammoth 는 관계 파일이 가리키는 부분을 열고, 그 이름은 문서가 정한다.
 */
const NOT_READ = /^word\/(media|embeddings|fonts)\//
/** 미리보기는 그림까지 보인다 — 포함 개체·글꼴만 뺀다 */
const NOT_READ_PREVIEW = /^word\/(embeddings|fonts)\//

/** XML 로 읽히는 부분 — 여기에 든 DOCTYPE 은 문서를 거절하고, 그 밖의 부분(붙여 넣은 HTML 조각 등)은 넘기지 않는다 */
const XML_PART = /\.(xml|rels)$/i

/**
 * turndown 은 문단 수가 늘면 대략 제곱으로 느려진다 — 2026-10-02 보안 점검 실측: 짧은 문단으로 채운 1.2MB HTML 5.9초,
 * 0.32MB 0.35초. 결과는 어차피 CLIP_TEXT_LIMIT 에서 잘리므로 그 2배까지만 넘긴다
 */
const HTML_LIMIT = CLIP_TEXT_LIMIT * 2

const childElements = (node: Element, names: string[]): Element[] =>
  Array.from(node.childNodes).filter(
    (child): child is Element => child.nodeType === 1 && names.includes(child.nodeName)
  )

/** 표의 행 — thead·tbody 아래 것까지, 칸 안에 든 다른 표의 행은 빼고 */
const rowsOf = (table: Element): Element[] =>
  childElements(table, ['TR', 'THEAD', 'TBODY', 'TFOOT']).flatMap((child) =>
    child.nodeName === 'TR' ? [child] : childElements(child, ['TR'])
  )

/**
 * 칸 격자를 채운다 — colspan 은 오른쪽에, rowspan 은 아래 행 같은 열에 빈 칸을 넣는다.
 * mammoth 는 세로 병합(vMerge)을 rowspan 하나로 내고 이어지는 행에서는 그 칸을 뺀다.
 */
const tableRows = (table: Element, cellText: (cell: Element) => string): string[][] => {
  const covered: number[] = []
  return rowsOf(table).map((tr) => {
    const row: string[] = []
    const skipCovered = (): void => {
      while ((covered[row.length] ?? 0) > 0) {
        covered[row.length] -= 1
        row.push('')
      }
    }
    for (const cell of childElements(tr, ['TD', 'TH'])) {
      skipCovered()
      const across = clampInt(cell.getAttribute('colspan'), 1, MAX_COL_SPAN)
      const down = clampInt(cell.getAttribute('rowspan'), 1, Number.MAX_SAFE_INTEGER)
      for (let i = 0; i < across && row.length < MAX_TABLE_COLUMNS; i += 1) {
        covered[row.length] = down - 1
        row.push(i === 0 ? cellText(cell) : '')
      }
    }
    while (row.length < Math.min(covered.length, MAX_TABLE_COLUMNS)) {
      if ((covered[row.length] ?? 0) > 0) covered[row.length] -= 1
      row.push('')
    }
    return row
  })
}

const markdownOf = (html: string): string => {
  // 칸 글자는 turndown 이 칸을 지날 때 한 번 받아 둔다 — 표 규칙에서 칸마다 다시 변환하면
  // 표 안의 표가 깊어질 때마다 일이 두 배가 된다
  const cellMarkdown = new WeakMap<object, string>()
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced'
  })
  // mammoth 는 문서의 대체 텍스트(wp:docPr 의 descr, 비면 title)를 img 의 alt 로 싣는다
  turndown.addRule('image', {
    filter: 'img',
    replacement: (_content, node) => imageMark((node as Element).getAttribute('alt')) // filter 가 'img' 라 여기 오는 노드는 요소다
  })
  // 목차·각주처럼 문서 안을 가리키는 링크는 보관함에서 갈 곳이 없다 — 글자만 남긴다
  turndown.addRule('internalLink', {
    filter: (node) => node.nodeName === 'A' && (node.getAttribute('href') ?? '').startsWith('#'),
    replacement: (content) => content
  })
  turndown.addRule('cell', {
    filter: ['td', 'th'],
    replacement: (content, node) => {
      cellMarkdown.set(node, content)
      return content
    }
  })
  // 표 글자 예산은 문서 전체에 하나 — 표마다 따로 두면 표 수천 개가 각자 상한까지 칸을 채운다
  let tableChars = 0
  turndown.addRule('table', {
    filter: 'table',
    replacement: (_content, node) => {
      // 예산을 다 쓴 뒤의 표는 어차피 capText 가 자르는 자리에 온다 — 칸 격자를 만들지 않는다(칸 변환은 turndown 이 이미 했다)
      if (tableChars > CLIP_TEXT_LIMIT) return ''
      const table = node as Element // filter 가 'table' 이라 TABLE 요소다 — @types/turndown 은 Document 까지 넓혀 둔다
      const rows = tableRows(table, (cell) => gfmCell(cellMarkdown.get(cell) ?? ''))
      if (rows.length === 0) return ''
      const markdown = gfmTable(rows, CLIP_TEXT_LIMIT - tableChars)
      tableChars += markdown.length
      return `\n\n${markdown}\n\n`
    }
  })
  return turndown.turndown(html)
}

/**
 * 잰 부분 가운데 mammoth 에 넘길 것 — XML 부분의 DOCTYPE 은 거절하고, 다른 부분의 DOCTYPE 은 빼고 넘긴다
 * (mammoth 1.13 은 XML 이 아닌 부분 — 붙여 넣은 HTML 조각 altChunk 등 — 을 읽지 않는다)
 */
const partsForMammoth = (parts: Record<string, Uint8Array>): Record<string, Uint8Array> => {
  // 항목 이름은 외부 입력이다 — __proto__ 같은 이름이 프로토타입을 건드리지 않게 맨 객체에 모은다
  const kept: Record<string, Uint8Array> = Object.create(null)
  for (const [name, data] of Object.entries(parts)) {
    const text = strFromU8(data)
    if (XML_PART.test(name)) assertNoDoctype(text, name)
    else if (/<!DOCTYPE/i.test(text)) continue
    kept[name] = data
  }
  return kept
}

/** mammoth 문서 모델의 노드 — 여기서 쓰는 필드만 */
type MammothNode = { type?: string; noteType?: string; noteId?: string; children?: MammothNode[] }

/**
 * 같은 각주를 두 번째부터 가리키는 참조를 지운다. mammoth 는 참조마다 그 각주를 문서 끝에 다시 그려서,
 * 큰 각주 하나를 수천 번 가리키는 파일은 수백 MB 의 HTML 이 된다(2026-10-02 보안 점검 실측).
 * mammoth 가 이름공간까지 풀어 읽은 참조를 보므로 XML 을 어떻게 꾸며도 이 판정과 어긋나지 않는다.
 * 깊이는 재귀 대신 스택으로 걷는다 — 깊게 겹친 표가 호출 스택을 넘기지 않게
 */
export const dropRepeatedNoteReferences = (document: MammothNode): MammothNode => {
  const seen = new Set<string>()
  const stack: MammothNode[] = [document]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node?.children) continue
    // 각주마다 참조 하나만 남긴다 — 스택에 거꾸로 넣어 대체로 문서 앞쪽 참조가 남게 한다
    node.children = node.children.filter((child) => {
      if (child.type !== 'noteReference') return true
      const key = `${child.noteType}:${child.noteId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    for (let i = node.children.length - 1; i >= 0; i -= 1) stack.push(node.children[i])
  }
  return document
}

/**
 * mammoth 에 넘길 docx — mammoth 는 크기 상한이 없다. 먼저 풀어 보며 상한·DOCTYPE 을 재고, 잰 부분만 다시 묶는다.
 * 원본을 그대로 넘기면 jszip 은 중앙 디렉터리로, fflate 는 로컬 헤더로 항목을 찾아 잰 것과 여는 것이 달라질 수 있다.
 * `images` 면 그림(word/media)도 같이 푼다 — 미리보기용
 */
export const docxForMammoth = (data: Uint8Array, images = false): Buffer => {
  const skip = images ? NOT_READ_PREVIEW : NOT_READ
  const parts = unzipWithin(data, (name) => !skip.test(name))
  return Buffer.from(zipSync(partsForMammoth(parts), { level: 0 }))
}

export const docxText = async (path: string): Promise<{ text: string; images: number }> => {
  const buffer = docxForMammoth(new Uint8Array(await readFile(path)))
  let images = 0
  const { value, messages } = await mammoth.convertToHtml(
    { buffer },
    {
      // 그림은 읽지 않고 자리만 — turndown 의 image 규칙이 자리표로 바꾼다
      convertImage: mammoth.images.imgElement(async () => {
        images += 1
        return { src: '' }
      }),
      // 문서가 가리키는 바깥 파일(링크된 그림 등)은 열지 않는다 — mammoth 기본값을 명시한다
      externalFileAccess: false,
      transformDocument: dropRepeatedNoteReferences
    }
  )
  // 글상자·수식처럼 mammoth 가 옮기지 못한 것은 여기에 남는다 — 빠진 것을 나중에 찾을 수 있게 남긴다
  if (messages.length > 0) {
    console.warn(
      'could not convert part of the Word document',
      path,
      messages.slice(0, 5).map((m) => m.message)
    )
  }
  const clipped = value.length > HTML_LIMIT
  // 문단 경계에서 자른다 — 경계가 없으면(문단 하나가 상한보다 길면) 상한에서
  const end = value.lastIndexOf('</p>', HTML_LIMIT)
  const text = markdownOf(
    clipped ? value.slice(0, end > 0 ? end + '</p>'.length : HTML_LIMIT) : value
  ).trim()
  // 잘린 HTML 이 상한보다 짧은 글이 되면 capText 가 잘린 표시를 붙이지 않으므로 직접 붙인다
  return {
    text:
      clipped && text.length <= CLIP_TEXT_LIMIT
        ? `${text}\n\n---\n\n${CLIP_CUT_NOTE}`
        : capText(text),
    images
  }
}
