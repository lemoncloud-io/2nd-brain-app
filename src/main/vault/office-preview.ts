// 워드·파워포인트 미리보기 — 보관함의 .docx·.pptx 를 그림까지 담은 HTML 한 장으로 바꾼다.
// 결과는 `vault://…?preview` 가 내주고, 렌더러가 fetch 로 받아 sandbox="" iframe 의 srcdoc 으로 띄운다
// (스크립트를 막는 것은 이스케이프·sandbox·앱 CSP 다 — 응답 CSP 는 주소로 바로 열 때의 울타리).
// 읽는 길은 자료 넣기(clip/docx-text·pptx-text)와 같다 — zip 상한·DOCTYPE 거절을 그대로 거친다.
// 문서는 외부 입력이다: 글자는 모두 이스케이프하고, 그림은 data: 로만 싣는다(바깥 주소를 부르지 않는다).
import { readFile } from 'node:fs/promises'
import { posix } from 'node:path'
import { strFromU8 } from 'fflate'
import mammoth from 'mammoth'
import { unzipWithin } from '../clip/clip-text'
import { docxForMammoth, dropRepeatedNoteReferences } from '../clip/docx-text'
import { readSlides } from '../clip/pptx-text'
import { attrOf, childrenOf, firstPath, parseXml, tagOf } from '../clip/xml-tree'
import { extOf } from '../../shared/vault-file-types'
import { mainT } from '../i18n'

/** 그림 하나·합계 상한 — 넘는 그림은 싣지 않고 자리만 남긴다 */
const IMAGE_BYTES = 5 * 1024 * 1024
const IMAGES_TOTAL = 20 * 1024 * 1024

/** 싣는 그림 형식 — emf·wmf·tiff 는 브라우저가 못 그리고, svg 는 싣지 않는다 */
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp'
}
const IMAGE_MIMES = new Set(Object.values(IMAGE_TYPES))

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const STYLE = `
body { margin: 0; padding: 24px 32px; font: 15px/1.6 -apple-system, "Segoe UI", sans-serif; color: #1f1f1f; background: #fff; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; margin: 12px 0; }
td, th { border: 1px solid #d0d0d0; padding: 4px 8px; vertical-align: top; }
section { border: 1px solid #e2e2e2; border-radius: 6px; padding: 16px 20px; margin: 0 0 16px; }
section h2 { margin: 0 0 8px; font-size: 18px; }
section .n { color: #888; font-size: 12px; margin: 0 0 4px; }
section p { white-space: pre-wrap; margin: 6px 0; }
.cut { color: #888; }
`

const page = (body: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${body}</body></html>`

/** 그림 예산 — 하나·합계 상한 안의 것만 싣는다 */
const imageBudget = (): ((bytes: number) => boolean) => {
  let used = 0
  return (bytes) => {
    if (bytes > IMAGE_BYTES || used + bytes > IMAGES_TOTAL) return false
    used += bytes
    return true
  }
}

const docxHtml = async (data: Uint8Array): Promise<string> => {
  const fits = imageBudget()
  const { value } = await mammoth.convertToHtml(
    { buffer: docxForMammoth(data, true) },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.readAsBase64String()
        const type = image.contentType
        // base64 4글자 = 3바이트
        if (!IMAGE_MIMES.has(type) || !fits((base64.length * 3) / 4)) {
          return { src: '' }
        }
        return { src: `data:${type};base64,${base64}` }
      }),
      externalFileAccess: false,
      transformDocument: dropRepeatedNoteReferences
    }
  )
  // mammoth 는 글자를 이스케이프해 내놓는다 — 링크 주소는 남지만 sandbox 문서라 누르면 아무 데도 못 간다
  return value
}

/** 슬라이드 관계 파일 — ppt/slides/slide1.xml → ppt/slides/_rels/slide1.xml.rels */
const relsOf = (slide: string): string =>
  posix.join(posix.dirname(slide), '_rels', `${posix.basename(slide)}.rels`)

/**
 * 슬라이드의 그림 관계 id → zip 안 그림 경로. 바깥 주소(TargetMode External)와
 * ppt/media/ 밖을 가리키는 것(`../../x` 등)은 버린다 — 그림 칸으로 다른 부분을 읽지 못하게
 */
const mediaTargets = (slide: string, xml: Uint8Array): Map<string, string> => {
  const root = firstPath(parseXml(strFromU8(xml), relsOf(slide)), 'Relationships')
  const found = new Map<string, string>()
  for (const node of root ? childrenOf(root, 'Relationships') : []) {
    if (tagOf(node) !== 'Relationship' || attrOf(node, 'TargetMode') === 'External') continue
    const id = attrOf(node, 'Id')
    const target = attrOf(node, 'Target') ?? ''
    const path = target.startsWith('/')
      ? posix.normalize(target.slice(1))
      : posix.normalize(posix.join(posix.dirname(slide), target))
    if (id && path.startsWith('ppt/media/') && IMAGE_TYPES[extOf(path)]) found.set(id, path)
  }
  return found
}

const pptxHtml = (data: Uint8Array): string => {
  const { slides, total } = readSlides(data)
  const relNames = new Set(slides.filter((s) => s.pictures.length > 0).map((s) => relsOf(s.name)))
  const rels = unzipWithin(data, (name) => relNames.has(name))
  const targets = new Map(
    slides.map((s) => {
      const xml = rels[relsOf(s.name)]
      return [s.name, xml ? mediaTargets(s.name, xml) : new Map<string, string>()]
    })
  )
  const wanted = new Set([...targets.values()].flatMap((map) => [...map.values()]))
  // 그림은 합계 상한까지만 푼다 — 넘으면 그림 없이 글만 보인다
  let media: Record<string, Uint8Array> = {}
  try {
    if (wanted.size > 0) media = unzipWithin(data, (name) => wanted.has(name), IMAGES_TOTAL)
  } catch {
    media = {}
  }
  const fits = imageBudget()
  const sections = slides
    .filter((s) => s.title || s.blocks.length > 0)
    .map((s) => {
      const pictures = new Map(s.pictures.map((p) => [p.at, p.embed]))
      const blocks = s.blocks.map((block, at) => {
        const embed = pictures.get(at)
        const path = embed === undefined ? undefined : targets.get(s.name)?.get(embed)
        const bytes = path === undefined ? undefined : media[path]
        if (bytes && fits(bytes.length)) {
          const src = `data:${IMAGE_TYPES[extOf(path ?? '')]};base64,${Buffer.from(bytes).toString('base64')}`
          // 자리표(`[IMAGE: 설명]`)의 설명만 대체 글로
          const alt = block.replace(/^\[IMAGE:? ?/, '').replace(/\]$/, '')
          return `<img src="${src}" alt="${escapeHtml(alt)}">`
        }
        return `<p>${escapeHtml(block)}</p>`
      })
      const title = s.title ? `<h2>${escapeHtml(s.title)}</h2>` : ''
      return `<section><p class="n">${s.index + 1}</p>${title}${blocks.join('')}</section>`
    })
  // 글자 상한에서 멈췄으면 그렇다고 — 뒤 슬라이드가 말없이 사라지지 않게
  const read = slides.length === 0 ? 0 : slides[slides.length - 1].index + 1
  const cut = read < total ? `<p class="cut">${mainT().vaultMain.previewCut(read + 1)}</p>` : ''
  return sections.join('') + cut
}

/** .docx·.pptx 를 미리보기 HTML 로 — 읽지 못하면 던진다(호출자가 실패 응답으로 바꾼다) */
export const officePreviewHtml = async (path: string): Promise<string> => {
  const data = new Uint8Array(await readFile(path))
  const ext = extOf(path)
  if (ext === '.docx') return page(await docxHtml(data))
  if (ext === '.pptx') return page(pptxHtml(data))
  throw new Error(`not a preview format: ${ext}`)
}
