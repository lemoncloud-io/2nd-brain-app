// 최소 .docx·.pptx 를 테스트 안에서 만든다 — 실물 문서는 개인·고객사 정보라 커밋하지 않는다.
// 구조는 OOXML(ECMA-376) 그대로다: docx 는 word/document.xml + styles·numbering,
// pptx 는 presentation.xml 의 p:sldIdLst 가 rels 를 거쳐 ppt/slides/slideN.xml 을 가리킨다.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'

const REL = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"'
const OD = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const PA =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

export const writeZip = (path: string, files: Record<string, string>): string => {
  const entries: Record<string, Uint8Array> = {}
  for (const [name, body] of Object.entries(files)) entries[name] = strToU8(body)
  writeFileSync(path, zipSync(entries))
  return path
}

// ── docx ──

/** 문단 하나. style = styles.xml 의 styleId, list = numbering.xml 의 numId(1 = 글머리, 2 = 번호)와 단계 */
export const wP = (
  text: string,
  opts: { style?: string; list?: [number, number] } = {}
): string => {
  const props = [
    opts.style ? `<w:pStyle w:val="${opts.style}"/>` : '',
    opts.list
      ? `<w:numPr><w:ilvl w:val="${opts.list[1]}"/><w:numId w:val="${opts.list[0]}"/></w:numPr>`
      : ''
  ].join('')
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

/** 표 칸 — span = 가로 병합(gridSpan), merge = 세로 병합(restart 가 시작, continue 가 이어짐) */
export type WCell = string | { text: string; span?: number; merge?: 'restart' | 'continue' }

export const wTbl = (rows: WCell[][]): string =>
  `<w:tbl><w:tblPr/>${rows
    .map(
      (row) =>
        `<w:tr>${row
          .map((cell) => {
            const c = typeof cell === 'string' ? { text: cell } : cell
            const props = [
              c.span ? `<w:gridSpan w:val="${c.span}"/>` : '',
              c.merge === 'restart' ? '<w:vMerge w:val="restart"/>' : '',
              c.merge === 'continue' ? '<w:vMerge/>' : ''
            ].join('')
            return `<w:tc>${props ? `<w:tcPr>${props}</w:tcPr>` : ''}${wP(c.text)}</w:tc>`
          })
          .join('')}</w:tr>`
    )
    .join('')}</w:tbl>`

const attr = (name: string, value: string | undefined): string =>
  value === undefined
    ? ''
    : ` ${name}="${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/\n/g, '&#10;')}"`

/** 본문 그림 하나(`alt` = 대체 텍스트) — r:embed 는 docxFiles 가 넣는 word/media/image1.png 를 가리킨다 */
export const wPic = (alt?: string): string =>
  `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:docPr id="1" name="그림 1"${attr('descr', alt)}/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="rIdImg" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`

const STYLES = `${XML}<w:styles ${W}>${[1, 2, 3]
  .map(
    (n) =>
      `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/></w:style>`
  )
  .join('')}</w:styles>`

const NUMBERING = `${XML}<w:numbering ${W}>${[
  ['0', 'bullet'],
  ['1', 'decimal']
]
  .map(
    ([id, fmt]) =>
      `<w:abstractNum w:abstractNumId="${id}">${[0, 1]
        .map((lvl) => `<w:lvl w:ilvl="${lvl}"><w:numFmt w:val="${fmt}"/></w:lvl>`)
        .join('')}</w:abstractNum>`
  )
  .join(
    ''
  )}<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`

export const docxFiles = (
  body: string,
  extra: Record<string, string> = {}
): Record<string, string> => ({
  '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  '_rels/.rels': `${XML}<Relationships ${REL}><Relationship Id="rId1" Type="${OD}/officeDocument" Target="word/document.xml"/></Relationships>`,
  'word/_rels/document.xml.rels': `${XML}<Relationships ${REL}><Relationship Id="rId1" Type="${OD}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${OD}/numbering" Target="numbering.xml"/><Relationship Id="rIdImg" Type="${OD}/image" Target="media/image1.png"/><Relationship Id="rIdLink" Type="${OD}/hyperlink" Target="https://example.com/" TargetMode="External"/></Relationships>`,
  'word/media/image1.png': 'not really a png',
  'word/styles.xml': STYLES,
  'word/numbering.xml': NUMBERING,
  'word/document.xml': `${XML}<w:document ${W}><w:body>${body}</w:body></w:document>`,
  ...extra
})

export const docx = (dir: string, name: string, body: string): string =>
  writeZip(join(dir, name), docxFiles(body))

// ── pptx ──

/** 도형 하나 — ph = 자리표시자 종류(title·ctrTitle·body·subTitle…, '' 은 type 없는 본문 자리), 없으면 글상자 */
export const pSp = (paras: string[], ph?: string): string =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr>${
    ph === undefined ? '' : `<p:ph${ph ? ` type="${ph}"` : ''} idx="1"/>`
  }</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${paras.join('')}</p:txBody></p:sp>`

/** 문단 하나 — lvl 은 글머리 단계, bu = 'none' 이면 글머리 없음, 'char' 면 글상자라도 글머리 */
export const aP = (text: string, opts: { lvl?: number; bu?: 'none' | 'char' } = {}): string => {
  const bu = opts.bu === 'none' ? '<a:buNone/>' : opts.bu === 'char' ? '<a:buChar char="•"/>' : ''
  const lvl = opts.lvl ? ` lvl="${opts.lvl}"` : ''
  return `<a:p>${lvl || bu ? `<a:pPr${lvl}>${bu}</a:pPr>` : ''}<a:r><a:t>${text}</a:t></a:r></a:p>`
}

/** 표 칸 — gridSpan·hMerge·rowSpan·vMerge 는 PowerPoint 가 쓰는 속성 그대로 */
export type ACell = string | { text: string; attrs: string }

export const pTbl = (rows: ACell[][]): string =>
  `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="t"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid/>${rows
    .map(
      (row) =>
        `<a:tr h="1">${row
          .map((cell) => {
            const c = typeof cell === 'string' ? { text: cell, attrs: '' } : cell
            return `<a:tc${c.attrs ? ` ${c.attrs}` : ''}><a:txBody><a:bodyPr/>${aP(c.text)}</a:txBody></a:tc>`
          })
          .join('')}</a:tr>`
    )
    .join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`

/** 슬라이드 그림 하나 — `alt` 는 대체 텍스트(descr), `title` 은 descr 가 없을 때 쓰이는 제목 */
export const pPic = (alt?: string, title?: string): string =>
  `<p:pic><p:nvPicPr><p:cNvPr id="4" name="그림"${attr('descr', alt)}${attr('title', title)}/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill/><p:spPr/></p:pic>`

export const pGrp = (inner: string): string =>
  `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${inner}</p:grpSp>`

/**
 * slides = 발표 순서대로의 슬라이드 본문(spTree 안). file = 그 슬라이드의 파일 번호 —
 * 기본은 1, 2, 3…이고, 주면 파일 이름 순서와 발표 순서를 일부러 어긋나게 할 수 있다.
 */
export const pptxFiles = (
  slides: string[],
  file: number[] = slides.map((_, i) => i + 1),
  extra: Record<string, string> = {}
): Record<string, string> => {
  const files: Record<string, string> = {
    '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`,
    '_rels/.rels': `${XML}<Relationships ${REL}><Relationship Id="rId1" Type="${OD}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    'ppt/presentation.xml': `${XML}<p:presentation ${PA} xmlns:r="${OD}"><p:sldIdLst>${slides
      .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 10}"/>`)
      .join('')}</p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `${XML}<Relationships ${REL}>${slides
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 10}" Type="${OD}/slide" Target="slides/slide${file[i]}.xml"/>`
      )
      .join('')}</Relationships>`,
    ...extra
  }
  slides.forEach((body, i) => {
    files[`ppt/slides/slide${file[i]}.xml`] =
      `${XML}<p:sld ${PA}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${body}</p:spTree></p:cSld></p:sld>`
  })
  return files
}

export const pptx = (dir: string, name: string, slides: string[], file?: number[]): string =>
  writeZip(join(dir, name), pptxFiles(slides, file))

// ── xlsx ──
// 글자는 inlineStr, 날짜는 스타일 1(numFmtId 14) 로 표시한다. read-excel-file 9.3.10 이 이 구조를 읽는 것을 확인했다.

export type XCell = string | number | { date: number } | null
const SML = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'

const xCellXml = (c: XCell, ref: string): string => {
  if (c === null) return ''
  if (typeof c === 'number') return `<c r="${ref}"><v>${c}</v></c>`
  if (typeof c === 'object') return `<c r="${ref}" s="1"><v>${c.date}</v></c>`
  return `<c r="${ref}" t="inlineStr"><is><t>${c}</t></is></c>`
}
const sheetXml = (rows: XCell[][]): string =>
  `${XML}<worksheet ${SML}><sheetData>${rows
    .map(
      (r, i) =>
        `<row r="${i + 1}">${r.map((c, j) => xCellXml(c, `${String.fromCharCode(65 + j)}${i + 1}`)).join('')}</row>`
    )
    .join('')}</sheetData></worksheet>`

export const xlsx = (dir: string, name: string, sheets: Record<string, XCell[][]>): string => {
  const names = Object.keys(sheets)
  const files: Record<string, string> = {
    '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join('')}</Types>`,
    '_rels/.rels': `${XML}<Relationships ${REL}><Relationship Id="rId1" Type="${OD}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${XML}<workbook ${SML} xmlns:r="${OD}"><sheets>${names
      .map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML}<Relationships ${REL}>${names
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="${OD}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join(
        ''
      )}<Relationship Id="rId${names.length + 1}" Type="${OD}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `${XML}<styleSheet ${SML}><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>`
  }
  names.forEach((n, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheets[n])
  })
  return writeZip(join(dir, name), files)
}
