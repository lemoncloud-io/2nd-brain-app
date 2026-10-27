import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CLIP_CUT_NOTE } from './clip-text'
import { pdfText } from './pdf-text'

// 최소 유효 PDF를 바이트 오프셋 계산으로 조립 — 외부 생성기 없이 텍스트 페이지를 만든다
const buildPdf = (pages: string[]): Buffer => {
  const objects: string[] = []
  const kids: string[] = []
  pages.forEach((text, i) => {
    const chunks: string[] = []
    for (let at = 0; at < text.length; at += 100) chunks.push(`(${text.slice(at, at + 100)}) Tj T*`)
    const stream = `BT /F1 12 Tf 10 19900 Td 14 TL\n${chunks.join('\n')}\nET`
    objects.push(
      `${3 + i * 2} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
    )
    objects.push(
      `${4 + i * 2} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 600 20000] /Contents ${3 + i * 2} 0 R >>\nendobj\n`
    )
    kids.push(`${4 + i * 2} 0 R`)
  })
  const n = 3 + pages.length * 2
  objects.push(`${n} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`)
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  const head = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>\nendobj\n`
  pdf += head
  for (const obj of objects) {
    offsets.push(pdf.length)
    pdf += obj
  }
  const xref = pdf.length
  const total = n + 1
  pdf += `xref\n0 ${total}\n0000000000 65535 f \n`
  pdf += `0000000009 00000 n \n0000000058 00000 n \n`
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}

describe('pdfText', () => {
  it('글자 PDF에서 글자를 뽑는다', async () => {
    await expect(pdfText('test/fixtures/pdf/sample.pdf')).resolves.toContain('PDF PREVIEW OK')
  })

  it('여러 페이지를 빈 줄로 잇는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdf-'))
    try {
      const file = join(dir, 'two.pdf')
      writeFileSync(file, buildPdf(['hello', 'world']))
      expect(await pdfText(file)).toBe('hello\n\nworld')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('PDF가 아닌 내용은 throw한다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdf-'))
    try {
      const file = join(dir, 'broken.pdf')
      writeFileSync(file, 'not a pdf')
      await expect(pdfText(file)).rejects.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('없는 파일은 throw한다', async () => {
    await expect(pdfText('/nonexistent/x.pdf')).rejects.toThrow(/ENOENT/)
  })

  it('상한을 넘기면 앞부분만 두고 잘린 표시를 붙인다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdf-'))
    try {
      const file = join(dir, 'long.pdf')
      writeFileSync(file, buildPdf([`a`.repeat(150_000)]))
      const text = await pdfText(file)
      expect(text).toContain(CLIP_CUT_NOTE)
      expect(text.length).toBeLessThan(130_000 + CLIP_CUT_NOTE.length + 100)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)
})
