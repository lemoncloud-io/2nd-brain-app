// HWP 5.0 바이너리(CFB) → 글자. HWPX 와 달리 직접 걷지 않고 @ssabrojs/hwpxjs 의 markdown 변환을 쓴다 —
// 2026-09-17 스파이크: 실물 사업계획서 21,557자·표 33개, 검수확인서 2,131자·표 2개·그림 18이 읽혔고,
// @hwp.js/parser(0.0.4-alpha) 는 글자 워커를 직접 써야 해서 기각. 압축 스트림 팽창은 라이브러리 안이라
// 여기서 못 막는다 — 입력 파일 크기 상한(MAX_CLIP_FILE_BYTES)이 유일한 방어고, pdfjs 와 같은 노출이다.
import { readFile } from 'node:fs/promises'
import { capText, imageMark, UnsupportedDocument } from './clip-text'
import { mainT } from '../i18n'

/** 그림 자리는 markdown 이미지 링크로 온다(embedImages:false — `![](BinData/imageN.ext)`) */
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g

/** hwpxjs 의 markdown → 본문 글자. 그림은 [IMAGE] 로 남기고 개수를 센다 */
export const hwpMarkdownToText = (md: string): { text: string; images: number } => ({
  text: capText(md.replace(IMAGE, imageMark()).trim()),
  images: (md.match(IMAGE) ?? []).length
})

export const hwpText = async (path: string): Promise<{ text: string; images: number }> => {
  const { detectFormat, hwpToMarkdown } = await import('@ssabrojs/hwpxjs')
  const data = new Uint8Array(await readFile(path))
  const format = detectFormat(data)
  if (format === 'hwp3') throw new UnsupportedDocument(mainT().clipMain.hwp3)
  if (format !== 'hwp') throw new Error('not an HWP 5.0 file')
  return hwpMarkdownToText(await hwpToMarkdown(data, { embedImages: false }))
}
