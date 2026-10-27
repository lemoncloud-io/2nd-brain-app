import { describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { addAnswer, addFile, addPage, addText, addUrl, claimUniquePath } from './clip-service'
import { CLIP_TEXT_LIMIT, MAX_CLIP_FILE_BYTES, ZIP_INFLATE_LIMIT } from './clip-text'
import { closeSync, ftruncateSync, openSync } from 'node:fs'
import { CLIP_FILE_TYPES } from '../../shared/ipc-contract'
import { writeHwp } from './hwp-fixture.test-util'
import { aP, docx, pPic, pptx, pSp, wP, wPic } from './office-fixture.test-util'
import { createVault } from '../vault/vault-service'
import { pendingClippings } from '../engine/work-branch'
import { execFileSync } from 'node:child_process'
import { mainT, setMainLanguage } from '../i18n'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'clip-'))
const vault = (): { dir: string; clean: () => void } => {
  const dir = tmp()
  return { dir, clean: () => rmSync(dir, { recursive: true, force: true }) }
}

const listen = async (server: Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as { port: number }).port)
    })
  })

describe('addFile', () => {
  it('.md 파일을 Clippings/에 복사한다', async () => {
    const v = vault()
    try {
      const src = join(v.dir, 'note.md')
      writeFileSync(src, '# hello')
      const result = await addFile(v.dir, src)
      expect(result.ok).toBe(true)
      if (result.ok) expect(readFileSync(result.path, 'utf8')).toBe('# hello')
    } finally {
      v.clean()
    }
  })

  it('사라진 파일은 던지지 않고 넣지 못했다고 말한다', async () => {
    const v = vault()
    try {
      const result = await addFile(v.dir, join(v.dir, '없는-파일.pdf'))
      expect(result.ok).toBe(false)
    } finally {
      v.clean()
    }
  })

  it('stat 뒤에 읽기가 깨져도 던지지 않고 넣지 못했다고 말한다', async () => {
    const v = vault()
    try {
      const dir = join(v.dir, '폴더.md')
      mkdirSync(dir)
      const result = await addFile(v.dir, dir)
      expect(result.ok).toBe(false)
    } finally {
      v.clean()
    }
  })

  it('.txt 는 본문 그대로 frontmatter 를 붙인 .md 로 넣는다', async () => {
    const v = vault()
    try {
      const src = join(v.dir, '회의 메모.txt')
      writeFileSync(src, '첫 줄\n둘째 줄\n')
      const result = await addFile(v.dir, src)
      expect(result).toEqual({
        ok: true,
        path: expect.stringMatching(/Clippings\/\d{4}-\d{2}-\d{2}-회의-메모\.md$/)
      })
      if (result.ok) {
        const text = readFileSync(result.path, 'utf8')
        expect(text).toMatch(/^---\ntitle: 회의 메모\nsource: 회의 메모\.txt\n/)
        expect(text).toContain('첫 줄\n둘째 줄')
      }
    } finally {
      v.clean()
    }
  })

  it('.pdf 는 글자를 뽑아 .md 로 넣는다', async () => {
    const v = vault()
    try {
      const result = await addFile(v.dir, 'test/fixtures/pdf/sample.pdf')
      expect(result.ok).toBe(true)
      if (result.ok) {
        const text = readFileSync(result.path, 'utf8')
        expect(text).toContain('source: sample.pdf')
        expect(text).toContain('PDF PREVIEW OK')
      }
    } finally {
      v.clean()
    }
  })

  it('PDF 가 아닌 내용의 .pdf 는 열지 못했다고 알린다', async () => {
    const v = vault()
    try {
      const src = join(v.dir, 'broken.pdf')
      writeFileSync(src, 'not a pdf')
      expect(await addFile(v.dir, src)).toEqual({
        ok: false,
        reason: expect.stringContaining('열지 못했어요')
      })
    } finally {
      v.clean()
    }
  })

  it('받지 않는 형식은 넣을 수 있는 형식을 알려 주며 거절한다', async () => {
    const v = vault()
    try {
      const src = join(v.dir, 'notes.rtf')
      writeFileSync(src, 'x')
      expect(await addFile(v.dir, src)).toEqual({
        ok: false,
        reason: expect.stringContaining(CLIP_FILE_TYPES.join('·'))
      })
    } finally {
      v.clean()
    }
  })

  it('화면 언어가 영어면 거절 사유도 영어다 — 형식 표처럼 모듈에 둔 문구까지', async () => {
    const v = vault()
    setMainLanguage('en')
    try {
      const rtf = join(v.dir, 'notes.rtf')
      const xls = join(v.dir, 'old.xls')
      writeFileSync(rtf, 'x')
      writeFileSync(xls, 'x')
      const bare = join(v.dir, 'README')
      writeFileSync(bare, 'x')
      expect(await addFile(v.dir, bare)).toEqual({
        ok: false,
        reason: `Extensionless files can't be added — only ${CLIP_FILE_TYPES.join('·')} can be added`
      })
      expect(await addFile(v.dir, rtf)).toEqual({
        ok: false,
        reason: `.rtf files can't be added — only ${CLIP_FILE_TYPES.join('·')} can be added`
      })
      expect(await addFile(v.dir, xls)).toEqual({
        ok: false,
        reason:
          'The old Excel format (.xls) can\'t be added — in Excel, use "Save As → .xlsx", then add it'
      })
    } finally {
      setMainLanguage('ko')
      v.clean()
    }
  })

  // 최소 hwpx — 태그 구조 검증은 hwpx-text.test.ts, 여기서는 addFile 의 분기·문구만 본다
  const hwpx = (dir: string, name: string, body: string): string => {
    const path = join(dir, name)
    const HP = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
    writeFileSync(
      path,
      zipSync({
        mimetype: strToU8('application/hwp+zip'),
        'Contents/section0.xml': strToU8(`<hs:sec ${HP}>${body}</hs:sec>`)
      })
    )
    return path
  }
  const para = (inner: string): string => `<hp:p><hp:run>${inner}</hp:run></hp:p>`

  it('.hwpx 는 문단을 뽑아 frontmatter 붙인 .md 로 넣고 원본 경로는 적지 않는다', async () => {
    const v = vault()
    try {
      const src = hwpx(v.dir, '검수 확인서.hwpx', para('<hp:t>납품 내역</hp:t>'))
      const result = await addFile(v.dir, src)
      expect(result).toEqual({
        ok: true,
        path: expect.stringMatching(/Clippings\/\d{4}-\d{2}-\d{2}-검수-확인서\.md$/)
      })
      if (result.ok) {
        const text = readFileSync(result.path, 'utf8')
        expect(text).toMatch(/^---\ntitle: 검수 확인서\nsource: 검수 확인서\.hwpx\n/)
        expect(text).toContain('납품 내역\n')
        expect(text).not.toContain(v.dir)
      }
    } finally {
      v.clean()
    }
  })

  it('글자 없는 .hwpx 는 거절하고, 그림만 있으면 그림 위주라고 말한다', async () => {
    const v = vault()
    try {
      const empty = await addFile(v.dir, hwpx(v.dir, 'empty.hwpx', para('')))
      expect(empty.ok).toBe(false)
      if (!empty.ok) {
        expect(empty.reason).toContain('글자를 찾지 못했어요')
        expect(empty.reason).not.toMatch(/그림 위주/)
      }
      const pictures = hwpx(v.dir, 'pictures.hwpx', para('<hp:pic id="1"/>'))
      const result = await addFile(v.dir, pictures)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toMatch(/그림 위주/)
      expect(existsSync(join(v.dir, 'Clippings'))).toBe(false)
    } finally {
      v.clean()
    }
  })

  it('zip 이 아닌 .hwpx 는 열지 못했다고 알린다', async () => {
    const v = vault()
    try {
      const src = join(v.dir, 'broken.hwpx')
      writeFileSync(src, 'not a zip')
      expect(await addFile(v.dir, src)).toEqual({
        ok: false,
        reason: expect.stringContaining('열지 못했어요')
      })
    } finally {
      v.clean()
    }
  })

  it('.hwp 도 같은 흐름으로 들어가고, 손상되면 열지 못했다고 알린다', async () => {
    const v = vault()
    try {
      const result = await addFile(v.dir, writeHwp(v.dir, '사업 계획서.hwp', ['개요', '목표']))
      expect(result).toEqual({
        ok: true,
        path: expect.stringMatching(/Clippings\/\d{4}-\d{2}-\d{2}-사업-계획서\.md$/)
      })
      if (result.ok) expect(readFileSync(result.path, 'utf8')).toContain('개요\n\n목표\n')
      const broken = join(v.dir, 'broken.hwp')
      writeFileSync(broken, 'not a compound file')
      expect(await addFile(v.dir, broken)).toEqual({
        ok: false,
        reason: expect.stringContaining('열지 못했어요')
      })
    } finally {
      v.clean()
    }
  })

  // 최소 xlsx — 시트 구조 검증은 xlsx-text.test.ts, 여기서는 addFile 의 분기·문구만 본다
  const xlsx = (dir: string, name: string, cells: string[][]): string => {
    const path = join(dir, name)
    const SML = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    const OD = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    const rows = cells
      .map(
        (r, i) =>
          `<row r="${i + 1}">${r
            .map(
              (c, j) =>
                `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t>${c}</t></is></c>`
            )
            .join('')}</row>`
      )
      .join('')
    const files: Record<string, string> = {
      '[Content_Types].xml': `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
      '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${OD}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `<?xml version="1.0"?><workbook ${SML} xmlns:r="${OD}"><sheets><sheet name="목록" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${OD}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet ${SML}><sheetData>${rows}</sheetData></worksheet>`
    }
    const entries: Record<string, Uint8Array> = {}
    for (const [k, v] of Object.entries(files)) entries[k] = strToU8(v)
    writeFileSync(path, zipSync(entries))
    return path
  }

  it('.xlsx 는 시트를 표로 뽑아 frontmatter 붙인 .md 로 넣는다', async () => {
    const v = vault()
    try {
      const src = xlsx(v.dir, '구매 품의.xlsx', [
        ['품목', '수량'],
        ['모니터', '2']
      ])
      const result = await addFile(v.dir, src)
      expect(result).toEqual({
        ok: true,
        path: expect.stringMatching(/Clippings\/\d{4}-\d{2}-\d{2}-구매-품의\.md$/)
      })
      if (result.ok) {
        const text = readFileSync(result.path, 'utf8')
        expect(text).toMatch(/^---\ntitle: 구매 품의\nsource: 구매 품의\.xlsx\n/)
        expect(text).toContain('## 목록\n\n| 품목 | 수량 |\n| --- | --- |\n| 모니터 | 2 |')
        expect(text).not.toContain(v.dir)
      }
    } finally {
      v.clean()
    }
  })

  it('빈 .xlsx 와 손상된 .xlsx 는 각각의 이유로 거절한다', async () => {
    const v = vault()
    try {
      const empty = await addFile(v.dir, xlsx(v.dir, 'empty.xlsx', []))
      expect(empty).toEqual({ ok: false, reason: expect.stringContaining('글자를 찾지 못했어요') })
      const broken = join(v.dir, 'broken.xlsx')
      writeFileSync(broken, 'not a workbook')
      expect(await addFile(v.dir, broken)).toEqual({
        ok: false,
        reason: expect.stringContaining('열지 못했어요')
      })
      expect(existsSync(join(v.dir, 'Clippings'))).toBe(false)
    } finally {
      v.clean()
    }
  })

  it('.xls 는 목록 문장 대신 xlsx 로 저장하라고 말한다', async () => {
    const v = vault()
    try {
      const src = join(v.dir, 'old.xls')
      writeFileSync(src, 'x')
      const result = await addFile(v.dir, src)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toContain('.xlsx')
        expect(result.reason).not.toContain(CLIP_FILE_TYPES.join('·'))
      }
    } finally {
      v.clean()
    }
  })

  it.each([
    ['.doc', '.docx'],
    ['.ppt', '.pptx']
  ])('옛 형식 %s 는 목록 문장 대신 %s 로 저장하라고 말한다', async (old, next) => {
    const v = vault()
    try {
      const src = join(v.dir, `old${old}`)
      writeFileSync(src, 'x')
      const result = await addFile(v.dir, src)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toContain(`"다른 이름으로 저장 → ${next}"`)
        expect(result.reason).not.toContain(CLIP_FILE_TYPES.join('·'))
      }
    } finally {
      v.clean()
    }
  })

  // 구조 검증은 docx-text·pptx-text 테스트, 여기서는 addFile 의 분기·문구만 본다
  it('.docx·.pptx 는 글자를 뽑아 frontmatter 붙인 .md 로 넣는다', async () => {
    const v = vault()
    try {
      const word = await addFile(v.dir, docx(v.dir, '회의록.docx', wP('결정 사항')))
      const slides = await addFile(v.dir, pptx(v.dir, '발표.pptx', [pSp([aP('첫 장')], 'title')]))
      expect(word).toEqual({
        ok: true,
        path: expect.stringMatching(/Clippings\/\d{4}-\d{2}-\d{2}-회의록\.md$/)
      })
      expect(slides).toEqual({
        ok: true,
        path: expect.stringMatching(/Clippings\/\d{4}-\d{2}-\d{2}-발표\.md$/)
      })
      if (word.ok && slides.ok) {
        expect(readFileSync(word.path, 'utf8')).toMatch(
          /^---\ntitle: 회의록\nsource: 회의록\.docx\n[\s\S]*\n---\n\n결정 사항\n$/
        )
        expect(readFileSync(slides.path, 'utf8')).toMatch(/\n---\n\n## 첫 장\n$/)
      }
    } finally {
      v.clean()
    }
  })

  it('글자 없는 .docx·.pptx 는 거절하고, 그림만 있으면 그림 위주라고 말한다', async () => {
    const v = vault()
    try {
      const empty = await addFile(v.dir, docx(v.dir, 'empty.docx', wP('')))
      expect(empty).toEqual({ ok: false, reason: expect.stringContaining('글자를 찾지 못했어요') })
      if (!empty.ok) expect(empty.reason).not.toMatch(/그림 위주/)
      const pictures = await addFile(v.dir, pptx(v.dir, 'pictures.pptx', [pPic()]))
      expect(pictures).toEqual({ ok: false, reason: expect.stringMatching(/그림 위주/) })
      // 대체 텍스트는 본문이 아니다 — 그림과 대체 텍스트만 있는 문서도 거절한다
      const described = await addFile(v.dir, docx(v.dir, 'described.docx', wPic('사진 설명')))
      expect(described).toEqual({ ok: false, reason: expect.stringMatching(/그림 위주/) })
      expect(existsSync(join(v.dir, 'Clippings'))).toBe(false)
    } finally {
      v.clean()
    }
  })

  it('풀면 상한을 넘는 문서는 손상이 아니라 너무 크다고 말한다', async () => {
    const v = vault()
    try {
      const src = docx(v.dir, 'huge.docx', wP('x'.repeat(ZIP_INFLATE_LIMIT + 1)))
      expect(await addFile(v.dir, src)).toEqual({ ok: false, reason: mainT().clipMain.zipTooLarge })
    } finally {
      v.clean()
    }
  })

  it.each([
    ['broken.docx', '워드 문서를 열지 못했어요'],
    ['broken.pptx', '파워포인트 파일을 열지 못했어요']
  ])('zip 이 아닌 %s 는 열지 못했다고 알린다', async (name, reason) => {
    const v = vault()
    try {
      const src = join(v.dir, name)
      writeFileSync(src, 'not a zip')
      expect(await addFile(v.dir, src)).toEqual({
        ok: false,
        reason: expect.stringContaining(reason)
      })
    } finally {
      v.clean()
    }
  })

  it('제목의 줄바꿈·--- 이 frontmatter 를 끝내거나 키를 더하지 못한다', async () => {
    const v = vault()
    try {
      const src = join(v.dir, 'a\n---\nmalicious: 1.txt')
      writeFileSync(src, '본문')
      const result = await addFile(v.dir, src)
      expect(result.ok).toBe(true)
      if (result.ok) {
        const text = readFileSync(result.path, 'utf8')
        const [, frontmatter] = text.split('---\n')
        expect(frontmatter.split('\n').filter(Boolean)).toHaveLength(3)
        expect(text).not.toMatch(/^malicious:/m)
      }
    } finally {
      v.clean()
    }
  })

  it('상한보다 큰 파일은 읽지 않고 거절한다', async () => {
    const v = vault()
    try {
      const src = join(v.dir, 'huge.txt')
      const fd = openSync(src, 'w')
      ftruncateSync(fd, MAX_CLIP_FILE_BYTES + 1) // sparse — 디스크를 실제로 쓰지 않는다
      closeSync(fd)
      expect(await addFile(v.dir, src)).toEqual({
        ok: false,
        reason: expect.stringContaining('너무 커요')
      })
    } finally {
      v.clean()
    }
  })

  it('.hwp 이름을 단 다른 형식은 열지 못했다고, 한글 3.0 은 HWPX 로 저장하라고 말한다', async () => {
    const v = vault()
    try {
      const renamed = join(v.dir, 'renamed.hwp')
      writeFileSync(renamed, zipSync({ mimetype: strToU8('application/hwp+zip') }))
      const result = await addFile(v.dir, renamed)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('열지 못했어요')
      // 한글 3.0 서명 — hwpxjs detectFormat 이 앞 17바이트 "HWP Document File" 로 판정한다
      const old = join(v.dir, 'old.hwp')
      writeFileSync(old, 'HWP Document File V3.00 \x1a\x01\x02\x03\x04\x05')
      const legacy = await addFile(v.dir, old)
      expect(legacy.ok).toBe(false)
      if (!legacy.ok) expect(legacy.reason).toContain('HWPX로 저장')
    } finally {
      v.clean()
    }
  })

  it('.txt 도 같은 상한에서 잘리고 잘렸다는 문장이 붙는다', async () => {
    const v = vault()
    try {
      const src = join(v.dir, 'long.txt')
      writeFileSync(src, 'x'.repeat(CLIP_TEXT_LIMIT + 5))
      const result = await addFile(v.dir, src)
      expect(result.ok).toBe(true)
      if (result.ok) {
        const text = readFileSync(result.path, 'utf8')
        expect(text).toContain('앞부분만 옮겼다')
        expect(text.length).toBeLessThan(CLIP_TEXT_LIMIT + 300)
      }
    } finally {
      v.clean()
    }
  })

  it('동명 파일이면 -1 접미사를 붙인다', async () => {
    const v = vault()
    try {
      const src = join(v.dir, 'note.md')
      writeFileSync(src, 'v2')
      await addFile(v.dir, src)
      const second = await addFile(v.dir, src)
      expect(second.ok && second.path.endsWith('note-1.md')).toBe(true)
    } finally {
      v.clean()
    }
  })
})

describe('addPage — 웹 탭에 그려진 페이지 담기', () => {
  it('렌더된 html 을 md 로 바꿔 제목·출처와 함께 Clippings 에 쓴다', () => {
    const v = vault()
    try {
      const html =
        '<html><head><title>그린 글</title></head><body><article><h1>그린 글</h1>' +
        `<p>${'스크립트가 쓴 본문이에요. '.repeat(20)}</p></article></body></html>`
      const result = addPage(v.dir, 'https://a.example/x?y=1', html)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.path.startsWith(join(v.dir, 'Clippings'))).toBe(true)
        const md = readFileSync(result.path, 'utf8')
        expect(md).toContain('source: https://a.example/x?y=1')
        expect(md).toContain('title: 그린 글')
        expect(md).toContain('스크립트가 쓴 본문이에요')
      }
    } finally {
      v.clean()
    }
  })

  it('제목에 줄바꿈·--- 가 있어도 frontmatter 를 깨지 못한다', () => {
    const v = vault()
    try {
      const result = addPage(
        v.dir,
        'https://a.example/',
        '<html><head><title>a\n---\nevil: 1</title></head><body><p>본문</p></body></html>'
      )
      expect(result.ok).toBe(true)
      if (result.ok) {
        const head = readFileSync(result.path, 'utf8').split('\n---\n')[0]
        expect(head).not.toMatch(/^evil:/m)
      }
    } finally {
      v.clean()
    }
  })

  it('http(s) 밖 주소·10MB 넘는 html 은 거절한다', () => {
    const v = vault()
    try {
      expect(addPage(v.dir, 'file:///etc/passwd', '<p>x</p>').ok).toBe(false)
      const big = addPage(v.dir, 'https://a.example/', 'x'.repeat(10 * 1024 * 1024 + 1))
      expect(big).toEqual({ ok: false, reason: '페이지가 10MB보다 커서 넣지 않았어요' })
    } finally {
      v.clean()
    }
  })
})

describe('addUrl', () => {
  it('html을 md로 변환해 frontmatter와 함께 저장한다', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(
        '<html><head><title>Doc</title></head><body><h1>Hi</h1><p>Body text</p></body></html>'
      )
    })
    const port = await listen(server)
    const v = vault()
    try {
      const result = await addUrl(v.dir, `http://127.0.0.1:${port}/page`)
      expect(result.ok).toBe(true)
      if (result.ok) {
        const md = readFileSync(result.path, 'utf8')
        expect(md).toContain('source: http://127.0.0.1')
        expect(md).toContain('title: Doc')
        expect(md).toContain('# Hi')
      }
    } finally {
      v.clean()
      server.close()
    }
  })

  it('비 http(s) URL은 거절한다', async () => {
    const v = vault()
    try {
      expect((await addUrl(v.dir, 'file:///etc/passwd')).ok).toBe(false)
      expect((await addUrl(v.dir, 'ftp://example.com')).ok).toBe(false)
    } finally {
      v.clean()
    }
  })

  it('10MB 초과 응답은 거절한다', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'text/html')
      res.end('x'.repeat(11 * 1024 * 1024))
    })
    const port = await listen(server)
    const v = vault()
    try {
      expect((await addUrl(v.dir, `http://127.0.0.1:${port}/big`)).ok).toBe(false)
    } finally {
      v.clean()
      server.close()
    }
  })

  it('지원하지 않는 content-type은 거절한다', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/octet-stream')
      res.end('\x00\x01')
    })
    const port = await listen(server)
    const v = vault()
    try {
      expect((await addUrl(v.dir, `http://127.0.0.1:${port}/bin`)).ok).toBe(false)
    } finally {
      v.clean()
      server.close()
    }
  })

  it('text/plain은 그대로 md로 저장한다', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'text/plain')
      res.end('plain body')
    })
    const port = await listen(server)
    const v = vault()
    try {
      const result = await addUrl(v.dir, `http://127.0.0.1:${port}/plain`)
      expect(result.ok && readFileSync(result.path, 'utf8').includes('plain body')).toBe(true)
    } finally {
      v.clean()
      server.close()
    }
  })

  it('리다이렉트는 따라가고 너무 많으면 거절한다', async () => {
    const server = createServer((req, res) => {
      if (req.url === '/go') {
        res.writeHead(302, { location: '/final' })
        res.end()
      } else if (req.url === '/loop') {
        res.writeHead(302, { location: '/loop' })
        res.end()
      } else {
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.end('<html><head><title>Final</title></head><body><p>도착</p></body></html>')
      }
    })
    const port = await listen(server)
    const v = vault()
    try {
      const followed = await addUrl(v.dir, `http://127.0.0.1:${port}/go`)
      expect(followed.ok).toBe(true)
      const refused = await addUrl(v.dir, `http://127.0.0.1:${port}/loop`)
      expect(refused.ok).toBe(false)
      if (!refused.ok) expect(refused.reason).toContain('너무 여러 번 넘어가요')
    } finally {
      v.clean()
      server.close()
    }
  })

  it('200이 아니면 HTTP 상태로 거절한다', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(404, { 'content-type': 'text/html' })
      res.end('없음')
    })
    const port = await listen(server)
    const v = vault()
    try {
      const result = await addUrl(v.dir, `http://127.0.0.1:${port}/missing`)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('HTTP 404')
    } finally {
      v.clean()
      server.close()
    }
  })
})

// ── addText (슬라이스 12 — 채팅 답 위키에 저장) ──

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()

const withGitVault = (body: (dir: string) => void): void => {
  const dir = tmp()
  try {
    expect(createVault(dir).ok).toBe(true)
    body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('addText', () => {
  it('질문+답을 Clippings/ md 로 저장하고 frontmatter 를 심는다', () => {
    withGitVault((dir) => {
      const result = addText(dir, {
        originVaultDir: dir,
        title: '질문 제목',
        question: '볼트가 뭐지?',
        answer: '볼트는 노트 모음이다',
        source: 'chat:conv-1'
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const md = readFileSync(result.path, 'utf8')
      expect(md).toContain('title: 질문 제목')
      expect(md).toContain('source: chat:conv-1')
      expect(md).toContain('clipped: ')
      expect(md).toContain('볼트가 뭐지?')
      expect(md).toContain('볼트는 노트 모음이다')
      expect(pendingClippings(dir)).toHaveLength(1)
    })
  })

  it('같은 제목 두 번 저장 시 접미사를 붙인다', () => {
    withGitVault((dir) => {
      const input = {
        originVaultDir: dir,
        title: '같은 제목',
        question: 'q',
        answer: 'a',
        source: 'chat:c'
      }
      const first = addText(dir, input)
      const second = addText(dir, input)
      expect(first.ok && second.ok).toBe(true)
      if (!(first.ok && second.ok)) return
      expect(first.path).not.toBe(second.path)
      expect(second.path.endsWith('-1.md')).toBe(true)
    })
  })

  it('위키화 진행 중(INGEST_LOCK)이면 거절한다', () => {
    withGitVault((dir) => {
      mkdirSync(join(dir, '.locks'), { recursive: true })
      writeFileSync(join(dir, '.locks', 'vault-ingest.lock'), '')
      const result = addText(dir, {
        originVaultDir: dir,
        title: 't',
        question: 'q',
        answer: 'a',
        source: 'chat:c'
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toContain('위키 초안 만들기')
    })
  })

  it('HEAD가 작업 브랜치에 있으면 거절한다', () => {
    withGitVault((dir) => {
      git(dir, 'checkout', '-q', '-b', 'app/ingest-2026-09-14')
      const result = addText(dir, {
        originVaultDir: dir,
        title: 't',
        question: 'q',
        answer: 'a',
        source: 'chat:c'
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toContain('승인을 기다리는 위키 초안 만들기가 있어요')
    })
  })

  it('원 실행 볼트가 현재 볼트와 다르면 거절한다', () => {
    withGitVault((dir) => {
      const other = tmp()
      try {
        const result = addText(dir, {
          originVaultDir: other,
          title: 't',
          question: 'q',
          answer: 'a',
          source: 'chat:c'
        })
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.reason).toContain(
          '다른 보관함에서 나온 답이라 이 보관함에 저장하지 않아요 — 그 보관함을 연 뒤 저장해 주세요'
        )
      } finally {
        rmSync(other, { recursive: true, force: true })
      }
    })
  })
})

describe('addAnswer', () => {
  it('채팅 답은 위키화 입력함이 아니라 outputs/ 의 질의 답(query-output)으로 남는다', () => {
    withGitVault((dir) => {
      const result = addAnswer(dir, {
        originVaultDir: dir,
        question: '전날 노트 확인해서 미결 파악해줘',
        answer: '미결은 두 개다',
        refs: ['wiki/dou-architecture.md', 'private/2026-09-17.md']
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.path).toContain(join(dir, 'outputs'))
      expect(result.path).toMatch(/\d{4}-\d{2}-\d{2}-전날-노트-확인해서-미결-파악해줘\.md$/)
      const md = readFileSync(result.path, 'utf8')
      expect(md).toContain('type: query-output')
      expect(md).toContain('question: 전날 노트 확인해서 미결 파악해줘')
      // 위키 문서는 wikilink, 그 밖은 경로 문자열 — 보관함 규칙의 sources 모양
      expect(md).toContain('sources: ["[[dou-architecture]]", private/2026-09-17.md]')
      expect(md).toContain('# 전날 노트 확인해서 미결 파악해줘\n\n## Answer\n\n미결은 두 개다')
      expect(md).toContain('- [[dou-architecture]]\n- `private/2026-09-17.md`')
      expect(pendingClippings(dir)).toHaveLength(0)
    })
  })

  it('다른 보관함에서 나온 답이면 쓰지 않는다', () => {
    withGitVault((dir) => {
      const result = addAnswer(dir, {
        originVaultDir: tmpdir(),
        question: 'q',
        answer: 'a',
        refs: []
      })
      expect(result).toEqual({
        ok: false,
        reason:
          '다른 보관함에서 나온 답이라 이 보관함에 저장하지 않아요 — 그 보관함을 연 뒤 저장해 주세요'
      })
    })
  })
})

describe('claimUniquePath', () => {
  it('빈 이름은 그대로 맡고 빈 파일을 남긴다', () => {
    const v = vault()
    try {
      const dest = claimUniquePath(v.dir, 'note.md')
      expect(dest).toBe(join(v.dir, 'note.md'))
      expect(existsSync(dest)).toBe(true)
    } finally {
      v.clean()
    }
  })

  it('차 있으면 -1/-2 로 비켜 가고 먼저 것은 그대로다', () => {
    const v = vault()
    try {
      writeFileSync(join(v.dir, 'note.md'), '먼저')
      const first = claimUniquePath(v.dir, 'note.md')
      expect(first).toBe(join(v.dir, 'note-1.md'))
      writeFileSync(first, '나중')
      const second = claimUniquePath(v.dir, 'note.md')
      expect(second).toBe(join(v.dir, 'note-2.md'))
      expect(readFileSync(join(v.dir, 'note.md'), 'utf8')).toBe('먼저')
      expect(readFileSync(first, 'utf8')).toBe('나중')
    } finally {
      v.clean()
    }
  })

  it('같은 이름 겹쳐 누르기 — 각자 다른 자리를 맡는다', () => {
    const v = vault()
    try {
      const got = [claimUniquePath(v.dir, 'a.md'), claimUniquePath(v.dir, 'a.md')]
      expect(new Set(got).size).toBe(2)
    } finally {
      v.clean()
    }
  })
})
