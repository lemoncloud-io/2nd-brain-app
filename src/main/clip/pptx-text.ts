// .pptx(PresentationML, zip + XML) → markdown. 라이브러리 없이 직접 걷는다 — officeparser 는
// node_modules 143MB 에 네이티브 canvas 를 끌고 온다(2026-10-01 조사).
// 발표 순서는 ppt/presentation.xml 의 p:sldIdLst → ppt/_rels/presentation.xml.rels 의 Target 이다.
// 파일 이름의 번호(slide10.xml)는 순서가 아니다. 슬라이드 본문은 p:cSld > p:spTree 아래
// p:sp(자리표시자·글상자)·p:graphicFrame(a:tbl 표)·p:grpSp(묶은 도형)·p:pic(그림)이다.
import { readFile } from 'node:fs/promises'
import { posix } from 'node:path'
import { strFromU8 } from 'fflate'
import {
  capText,
  clampInt,
  CLIP_TEXT_LIMIT,
  gfmCell,
  gfmTable,
  imageMark,
  MAX_TABLE_COLUMNS,
  unzipWithin
} from './clip-text'
import { attrOf, childrenOf, firstPath, parseXml, tagOf, type XmlNode } from './xml-tree'

const PRESENTATION = 'ppt/presentation.xml'
const PRESENTATION_RELS = 'ppt/_rels/presentation.xml.rels'

/** 슬라이드마다 마스터가 찍는 자리 — 날짜·쪽 번호·머리글·바닥글은 내용이 아니다 */
const SKIPPED_PLACEHOLDERS = new Set(['dt', 'sldNum', 'hdr', 'ftr'])
const TITLE_PLACEHOLDERS = new Set(['title', 'ctrTitle'])

/**
 * left = 문서 전체에 남은 글자 예산 — 슬라이드 하나에 표 수천 개를 넣어도 예산을 넘기면 더 걷지 않는다.
 * pictures = 그림 자리표 블록의 자리(blocks 의 번호)와 그 그림의 관계 id(r:embed) — 미리보기가 자리표 대신 그림을 그린다
 */
type Slide = {
  title: string
  blocks: string[]
  images: number
  left: number
  pictures: { at: number; embed: string | undefined }[]
}

const add = (slide: Slide, block: string): void => {
  slide.blocks.push(block)
  slide.left -= block.length + 2
}

/** a:p 하나의 글자 — a:r·a:fld 의 a:t, 줄바꿈(a:br)은 공백 */
const paragraphText = (p: XmlNode): string =>
  childrenOf(p, 'a:p')
    .map((item) => {
      const tag = tagOf(item)
      if (tag === 'a:br') return ' '
      if (tag !== 'a:r' && tag !== 'a:fld') return ''
      return childrenOf(item, tag)
        .filter((child) => tagOf(child) === 'a:t')
        .flatMap((t) => childrenOf(t, 'a:t').map((text) => String(text['#text'] ?? '')))
        .join('')
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

const paragraphsOf = (txBody: XmlNode | undefined): XmlNode[] =>
  txBody ? childrenOf(txBody, tagOf(txBody)).filter((node) => tagOf(node) === 'a:p') : []

/** 글머리 — 본문 자리표시자는 기본이 글머리(buNone 으로 끈다), 글상자는 buChar·buAutoNum 이 있을 때만 */
const bulletOf = (pPr: XmlNode | undefined, bodyPlaceholder: boolean): string | null => {
  const props = pPr ? childrenOf(pPr, 'a:pPr').map(tagOf) : []
  if (props.includes('a:buNone')) return null
  if (props.includes('a:buAutoNum')) return '1.'
  if (props.includes('a:buChar') || bodyPlaceholder) return '-'
  return null
}

const shape = (sp: XmlNode, slide: Slide): void => {
  const nodes = childrenOf(sp, 'p:sp')
  const ph = firstPath(nodes, 'p:nvSpPr', 'p:nvPr', 'p:ph')
  const type = ph ? (attrOf(ph, 'type') ?? '') : null
  if (type !== null && SKIPPED_PLACEHOLDERS.has(type)) return
  const paragraphs = paragraphsOf(firstPath(nodes, 'p:txBody'))
  if (type !== null && TITLE_PLACEHOLDERS.has(type) && !slide.title) {
    slide.title = paragraphs.map(paragraphText).filter(Boolean).join(' ')
    if (slide.title) return
  }
  const bodyPlaceholder = type !== null && type !== 'subTitle' && !TITLE_PLACEHOLDERS.has(type)
  // 이어지는 글머리 줄은 한 목록으로, 글머리 없는 문단은 따로 한 덩어리로
  let list: string[] = []
  const flush = (): void => {
    if (list.length > 0) add(slide, list.join('\n'))
    list = []
  }
  for (const p of paragraphs) {
    const text = paragraphText(p)
    if (!text) continue
    const pPr = firstPath(childrenOf(p, 'a:p'), 'a:pPr')
    const bullet = bulletOf(pPr, bodyPlaceholder)
    if (bullet === null) {
      flush()
      add(slide, text)
      continue
    }
    const level = clampInt(pPr ? attrOf(pPr, 'lvl') : undefined, 0, 8)
    list.push(`${'  '.repeat(level)}${bullet} ${text}`)
  }
  flush()
}

/** OOXML 참거짓 — "1"·"true" 만 참이다("0"·"false" 도 속성은 있다) */
const merged = (value: string | undefined): boolean => value === '1' || value === 'true'

/** 표 — 병합으로 가려진 칸(hMerge·vMerge)은 PowerPoint 가 빈 a:tc 로 남기므로 그 자리를 비운다 */
const table = (frame: XmlNode, slide: Slide): void => {
  const tbl = firstPath(childrenOf(frame, 'p:graphicFrame'), 'a:graphic', 'a:graphicData', 'a:tbl')
  if (!tbl) return
  const rows = childrenOf(tbl, 'a:tbl')
    .filter((tr) => tagOf(tr) === 'a:tr')
    .map((tr) =>
      childrenOf(tr, 'a:tr')
        .filter((tc) => tagOf(tc) === 'a:tc')
        .slice(0, MAX_TABLE_COLUMNS)
        .map((tc) =>
          merged(attrOf(tc, 'hMerge')) || merged(attrOf(tc, 'vMerge'))
            ? ''
            : gfmCell(
                paragraphsOf(firstPath(childrenOf(tc, 'a:tc'), 'a:txBody'))
                  .map(paragraphText)
                  .filter(Boolean)
                  .join(' ')
              )
        )
    )
    .filter((row) => row.length > 0)
  if (rows.length > 0) add(slide, gfmTable(rows, slide.left))
}

const walk = (nodes: XmlNode[], slide: Slide): void => {
  for (const node of nodes) {
    if (slide.left <= 0) return
    const tag = tagOf(node)
    if (tag === 'p:sp') shape(node, slide)
    else if (tag === 'p:graphicFrame') table(node, slide)
    else if (tag === 'p:grpSp') walk(childrenOf(node, tag), slide)
    else if (tag === 'p:pic') {
      slide.images += 1
      // 대체 텍스트는 p:nvPicPr > p:cNvPr 의 descr, 비면(공백뿐이어도) title 이다 — 워드 쪽 mammoth 와 같은 판정
      const props = firstPath(childrenOf(node, tag), 'p:nvPicPr', 'p:cNvPr')
      const blip = firstPath(childrenOf(node, tag), 'p:blipFill', 'a:blip')
      slide.pictures.push({ at: slide.blocks.length, embed: blip && attrOf(blip, 'r:embed') })
      add(slide, imageMark(props && (attrOf(props, 'descr')?.trim() || attrOf(props, 'title'))))
    } else if (tag === 'mc:AlternateContent') {
      // 새 기능을 쓴 도형은 mc:Choice 에, 옛 버전용 대체본은 mc:Fallback 에 든다 — 하나만 읽는다
      const choice = childrenOf(node, tag).find((child) => tagOf(child) === 'mc:Choice')
      if (choice) walk(childrenOf(choice, 'mc:Choice'), slide)
    }
  }
}

/** 발표 순서대로의 슬라이드 경로 — 같은 슬라이드를 여러 번 가리키면 한 번만 */
const slideOrder = (files: Map<string, Uint8Array>): string[] => {
  const presentationXml = files.get(PRESENTATION)
  const relsXml = files.get(PRESENTATION_RELS)
  if (!presentationXml || !relsXml) throw new Error('pptx has no presentation list')
  const list = firstPath(
    parseXml(strFromU8(presentationXml), PRESENTATION),
    'p:presentation',
    'p:sldIdLst'
  )
  const ids = (list ? childrenOf(list, 'p:sldIdLst') : [])
    .filter((node) => tagOf(node) === 'p:sldId')
    .map((node) => attrOf(node, 'r:id'))
  const relsRoot = firstPath(parseXml(strFromU8(relsXml), PRESENTATION_RELS), 'Relationships')
  const targets = new Map(
    (relsRoot ? childrenOf(relsRoot, 'Relationships') : [])
      .filter((node) => tagOf(node) === 'Relationship')
      .map((node) => [attrOf(node, 'Id'), attrOf(node, 'Target') ?? ''] as const)
  )
  // Target 은 ppt/ 기준 상대 경로이거나 / 로 시작하는 패키지 절대 경로다
  const paths = ids.map((id) => {
    const target = targets.get(id)
    if (!target) throw new Error(`pptx slide ${id} has no relationships`)
    return target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join('ppt', target))
  })
  return [...new Set(paths)]
}

const inflate = (data: Uint8Array, want: (name: string) => boolean): Map<string, Uint8Array> =>
  new Map(Object.entries(unzipWithin(data, want)))

/** 발표 순서의 슬라이드 하나 — name 은 zip 안 경로(ppt/slides/slideN.xml), index 는 발표 순서(0부터) */
export type ReadSlide = Omit<Slide, 'left'> & { name: string; index: number }

/**
 * 발표 순서대로 슬라이드를 걷는다 — 그림·마스터·레이아웃은 풀지 않는다. 발표 목록을 먼저 읽고, 그것이 가리키는
 * 슬라이드만 상한까지 푼다. 글자 상한(CLIP_TEXT_LIMIT)을 넘으면 거기서 멈춘다 — total 은 발표의 슬라이드 수
 */
export const readSlides = (data: Uint8Array): { slides: ReadSlide[]; total: number } => {
  const order = slideOrder(
    inflate(data, (name) => name === PRESENTATION || name === PRESENTATION_RELS)
  )
  const wanted = new Set(order)
  const files = inflate(data, (name) => wanted.has(name))
  const read: ReadSlide[] = []
  let length = 0
  for (const [index, name] of order.entries()) {
    const xml = files.get(name)
    if (!xml) throw new Error(`pptx slide ${name} is missing`)
    const tree = firstPath(parseXml(strFromU8(xml), name), 'p:sld', 'p:cSld', 'p:spTree')
    if (!tree) throw new Error(`pptx slide ${name} has no body tree`)
    const slide: Slide = {
      title: '',
      blocks: [],
      images: 0,
      left: CLIP_TEXT_LIMIT - length,
      pictures: []
    }
    walk(childrenOf(tree, 'p:spTree'), slide)
    const { title, blocks, images, pictures } = slide
    read.push({ name, index, title, blocks, images, pictures })
    // 글자 상한을 넘은 뒤의 슬라이드는 어차피 잘린다 — 더 읽지 않는다
    length += title.length + blocks.reduce((n, block) => n + block.length + 2, 0)
    if (length > CLIP_TEXT_LIMIT) break
  }
  return { slides: read, total: order.length }
}

export const pptxText = async (path: string): Promise<{ text: string; images: number }> => {
  const { slides } = readSlides(new Uint8Array(await readFile(path)))
  const sections: string[] = []
  let images = 0
  let hasText = false
  for (const slide of slides) {
    images += slide.images
    if (!slide.title && slide.blocks.length === 0) continue
    // 그림 하나가 자리표 블록 하나다 — 블록이 그림 수보다 많으면 글이 있다
    hasText ||= Boolean(slide.title) || slide.blocks.length > slide.images
    sections.push(
      // ui-hangul-ignore: 보관함에 남는 자료 본문 제목(D8)
      [`## ${slide.title || `슬라이드 ${slide.index + 1}`}`, ...slide.blocks].join('\n\n')
    )
  }
  // 그림만 있는 발표는 "슬라이드 N" 제목만 남는다 — 글자 없는 문서로 돌려줘 그림 위주라고 말하게 한다
  return { text: hasText ? capText(sections.join('\n\n')) : '', images }
}
