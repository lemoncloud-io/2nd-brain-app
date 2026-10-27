// PDF → 글자. 위키화 에이전트는 Clippings 의 markdown 을 읽으므로 PDF 는 넣을 때 글자만 뽑아 .md 로 둔다.
// pdfjs-dist legacy 빌드가 Node 에서 워커 없이 돈다. 스캔 이미지 PDF 는 글자가 없어 빈 문자열이다.
import { readFileSync } from 'node:fs'
import { capText } from './clip-text'

type TextItem = { str: string; hasEOL?: boolean }

export const pdfText = async (path: string): Promise<string> => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({
    data: new Uint8Array(readFileSync(path)),
    // 글꼴 경고(standardFontDataUrl)는 글자 추출과 무관하다
    verbosity: 0
  })
  try {
    const doc = await task.promise
    const pages: string[] = []
    for (let number = 1; number <= doc.numPages; number += 1) {
      const page = await doc.getPage(number)
      const content = await page.getTextContent()
      const text = (content.items as TextItem[])
        .map((item) => (item.hasEOL ? `${item.str}\n` : item.str))
        .join('')
        .replace(/[ \t]+\n/g, '\n')
        .trim()
      if (text) pages.push(text)
    }
    return capText(pages.join('\n\n'))
  } finally {
    await task.destroy()
  }
}
