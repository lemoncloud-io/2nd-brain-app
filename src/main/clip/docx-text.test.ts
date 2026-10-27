import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { docxText } from './docx-text'
import { CLIP_CUT_NOTE, CLIP_TEXT_LIMIT, ZIP_INFLATE_LIMIT } from './clip-text'
import { docx, docxFiles, wP, wPic, wTbl, writeZip } from './office-fixture.test-util'
import { mainT } from '../i18n'

const OD = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

describe('docxText', () => {
  const dir = mkdtempSync(join(tmpdir(), 'docx-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('제목은 #, 글머리 목록은 -, 번호 목록은 1. 로 옮긴다', async () => {
    const path = docx(
      dir,
      'lists.docx',
      wP('개요', { style: 'Heading1' }) +
        wP('본문 첫 줄') +
        wP('세부', { style: 'Heading2' }) +
        wP('하나', { list: [1, 0] }) +
        wP('하나 아래', { list: [1, 1] }) +
        wP('둘', { list: [1, 0] }) +
        wP('첫째', { list: [2, 0] }) +
        wP('둘째', { list: [2, 0] })
    )
    const { text } = await docxText(path)
    const lines = text.split('\n')
    expect(lines).toContain('# 개요')
    expect(lines).toContain('본문 첫 줄')
    expect(lines).toContain('## 세부')
    expect(text).toMatch(/^- +하나\n +- +하나 아래\n- +둘$/m)
    expect(text).toMatch(/^1\. +첫째\n2\. +둘째$/m)
  })

  it('표는 첫 행을 머리로 한 GFM 표가 되고, 칸 안 세로줄은 이스케이프한다', async () => {
    const path = docx(
      dir,
      'table.docx',
      wTbl([
        ['이름', '값'],
        ['가|나', '1']
      ])
    )
    const { text } = await docxText(path)
    expect(text).toBe('| 이름 | 값 |\n| --- | --- |\n| 가\\|나 | 1 |')
  })

  it('병합 칸은 빈 칸으로 채워 열이 밀리지 않는다', async () => {
    const path = docx(
      dir,
      'merged.docx',
      wTbl([
        [{ text: '가로 병합', span: 2 }, '셋'],
        [{ text: '세로 병합', merge: 'restart' }, '둘', '셋'],
        [{ text: '', merge: 'continue' }, '둘', '셋']
      ])
    )
    const { text } = await docxText(path)
    expect(text).toBe(
      [
        '| 가로 병합 |  | 셋 |',
        '| --- | --- | --- |',
        '| 세로 병합 | 둘 | 셋 |',
        '|  | 둘 | 셋 |'
      ].join('\n')
    )
  })

  it('문서 안을 가리키는 링크(목차 등)는 글자만 남기고 바깥 링크는 그대로 둔다', async () => {
    const path = docx(
      dir,
      'links.docx',
      '<w:p><w:hyperlink w:anchor="_Toc1"><w:r><w:t>개요 3</w:t></w:r></w:hyperlink></w:p>' +
        `<w:p><w:hyperlink r:id="rIdLink" xmlns:r="${OD}"><w:r><w:t>예시</w:t></w:r></w:hyperlink></w:p>`
    )
    const { text } = await docxText(path)
    expect(text).toBe('개요 3\n\n[예시](https://example.com/)')
  })

  it('그림은 [IMAGE] 자리만 남기고 개수를 센다', async () => {
    const path = docx(dir, 'picture.docx', wPic() + wP('설명'))
    expect(await docxText(path)).toEqual({ text: '[IMAGE]\n\n설명', images: 1 })
  })

  it('그림의 대체 텍스트는 자리표 안에 남긴다', async () => {
    const path = docx(dir, 'alt.docx', wPic('분기별 매출 그래프') + wP('설명'))
    expect(await docxText(path)).toEqual({
      text: '[IMAGE: 분기별 매출 그래프]\n\n설명',
      images: 1
    })
  })

  it('대체 텍스트의 줄바꿈·] 는 자리표를 깨지 않는다', async () => {
    const path = docx(dir, 'alt-break.docx', wPic('첫 줄\n둘째 줄 ] 뒤') + wP('설명'))
    expect((await docxText(path)).text).toBe('[IMAGE: 첫 줄 둘째 줄 뒤]\n\n설명')
  })

  it('표 칸 안 그림의 대체 텍스트에 | 가 있어도 열 수가 그대로다', async () => {
    const table = `<w:tbl><w:tblPr/><w:tr><w:tc>${wP('이름')}</w:tc><w:tc>${wP('그림')}</w:tc></w:tr><w:tr><w:tc>${wP('갑')}</w:tc><w:tc>${wPic('왼쪽 | 오른쪽')}</w:tc></w:tr></w:tbl>`
    const { text } = await docxText(docx(dir, 'alt-table.docx', table))
    const rows = text.split('\n').filter((line) => line.startsWith('|'))
    expect(rows).toHaveLength(3)
    // 이스케이프 안 된 세로줄 수가 줄마다 같다 — 2열이면 3개
    expect(rows.map((row) => row.replace(/\\\|/g, '').split('|').length - 1)).toEqual([3, 3, 3])
    expect(text).toContain('[IMAGE: 왼쪽 오른쪽]')
  })

  it('본문 XML 이 상한을 넘으면 변환기에 넘기기 전에 던진다', async () => {
    const path = docx(dir, 'bomb.docx', wP('x'.repeat(ZIP_INFLATE_LIMIT + 1)))
    await expect(docxText(path)).rejects.toThrow(mainT().clipMain.zipTooLarge)
  })

  it('관계 파일이 이름을 바꾼 본문을 가리켜도 그 본문까지 재고 상한을 넘으면 던진다', async () => {
    const files = docxFiles(wP('x'.repeat(ZIP_INFLATE_LIMIT + 1)))
    files['word/document.dat'] = files['word/document.xml']
    delete files['word/document.xml']
    files['_rels/.rels'] = files['_rels/.rels'].replace('word/document.xml', 'word/document.dat')
    const path = writeZip(join(dir, 'renamed.docx'), files)
    await expect(docxText(path)).rejects.toThrow(mainT().clipMain.zipTooLarge)
  })

  it('표 안의 표는 칸 글자로 접고, 깊게 겹쳐도 한 번씩만 변환한다', async () => {
    const nest = (depth: number): string =>
      depth === 0 ? wP('끝') : `<w:tbl><w:tr><w:tc>${nest(depth - 1)}</w:tc></w:tr></w:tbl>`
    const shallow = docx(
      dir,
      'nested.docx',
      `<w:tbl><w:tr><w:tc>${wP('겉')}</w:tc><w:tc>${wTbl([['안1', '안2']])}${wP('')}</w:tc></w:tr></w:tbl>`
    )
    const lines = (await docxText(shallow)).text.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^\| 겉 \| .*안1.*안2.* \|$/)
    // 칸마다 다시 변환하면 깊이마다 두 배다 — 깊이 25 는 그 방식이면 끝나지 않는다
    const deep = docx(dir, 'deep.docx', nest(25))
    expect((await docxText(deep)).text).toMatch(/^\| .*끝.* \|$/m)
  })

  it('그림 파일은 풀지 않으므로 상한을 넘는 그림이 있어도 읽는다', async () => {
    const path = writeZip(
      join(dir, 'big-media.docx'),
      docxFiles(wP('글'), { 'word/media/big.png': 'x'.repeat(ZIP_INFLATE_LIMIT + 1) })
    )
    expect((await docxText(path)).text).toBe('글')
  })

  it('DOCTYPE 이 든 XML 은 변환기에 넘기지 않고 던진다', async () => {
    const files = docxFiles(wP('글'))
    files['word/document.xml'] = files['word/document.xml'].replace(
      '?>',
      '?><!DOCTYPE w [<!ENTITY a "aaaa">]>'
    )
    const path = writeZip(join(dir, 'doctype.docx'), files)
    await expect(docxText(path)).rejects.toThrow(/DOCTYPE/)
  })

  it('그림·포함 개체·글꼴은 풀지 않으므로 상한을 넘어도 읽는다', async () => {
    const path = writeZip(
      join(dir, 'big-font.docx'),
      docxFiles(wP('글'), { 'word/fonts/font1.odttf': 'x'.repeat(ZIP_INFLATE_LIMIT + 1) })
    )
    expect((await docxText(path)).text).toBe('글')
  })

  it('XML 이 아닌 부분에 든 DOCTYPE(붙여 넣은 HTML 조각 등)은 문서를 막지 않는다', async () => {
    const path = writeZip(
      join(dir, 'altchunk.docx'),
      docxFiles(wP('글'), { 'word/afchunk.htm': '<!DOCTYPE html><html><body>조각</body></html>' })
    )
    expect((await docxText(path)).text).toBe('글')
  })

  describe('같은 각주를 거듭 가리키는 문서', () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    const WML = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    const withNotes = (refs: string, notes: string): Record<string, string> => {
      const files = docxFiles(`<w:p><w:r><w:t>본문</w:t></w:r>${refs}</w:p>`)
      files['word/footnotes.xml'] = `<w:footnotes ${W}>${notes}</w:footnotes>`
      files['word/_rels/document.xml.rels'] = files['word/_rels/document.xml.rels'].replace(
        '</Relationships>',
        `<Relationship Id="rIdFn" Type="${OD}/footnotes" Target="footnotes.xml"/></Relationships>`
      )
      return files
    }
    const note = (id: number, text: string): string =>
      `<w:footnote w:id="${id}"><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:footnote>`
    const body = '각'.repeat(20_000)
    const big = note(1, body)
    const times = (text: string): number => text.split(body).length - 1

    it('각주마다 한 번씩 가리키는 문서는 각주를 전부 옮긴다', async () => {
      const ref = (id: number): string => `<w:r><w:footnoteReference w:id="${id}"/></w:r>`
      const once = withNotes(
        Array.from({ length: 300 }, (_, i) => ref(i + 1)).join(''),
        Array.from({ length: 300 }, (_, i) => note(i + 1, `각주 ${i + 1}`)).join('')
      )
      const { text } = await docxText(writeZip(join(dir, 'notes-once.docx'), once))
      expect(text).toMatch(/각주 1(?!\d)/)
      expect(text).toContain('각주 300')
    })

    // mammoth 는 참조마다 각주를 다시 그린다 — 어떤 모양으로 써도 mammoth 가 읽은 참조 기준으로 한 번만 그려야 한다
    it.each([
      ['w: 접두사', (): string => '<w:r><w:footnoteReference w:id="1"/></w:r>'],
      ['다른 접두사', (): string => `<w:r><x:footnoteReference xmlns:x="${WML}" x:id="1"/></w:r>`],
      [
        '유니코드 접두사',
        (): string => `<w:r><ü:footnoteReference xmlns:ü="${WML}" ü:id="1"/></w:r>`
      ],
      ['작은따옴표', (): string => "<w:r><w:footnoteReference w:id='1'/></w:r>"],
      ['문자 참조 id', (): string => '<w:r><w:footnoteReference w:id="&#049;"/></w:r>'],
      [
        '다른 이름공간 id 를 앞에',
        (i: number): string =>
          `<w:r><w:footnoteReference xmlns:x="urn:x" x:id="${i}" w:id="1"/></w:r>`
      ],
      [
        '다른 속성값 안에 가짜 id',
        (i: number): string => `<w:r><w:footnoteReference q='id="${i}' id="e${i}" w:id="1"/></w:r>`
      ],
      [
        '속성값 안의 > 뒤에 진짜 id',
        (i: number): string => `<w:r><w:footnoteReference w:val="> ${i}" w:id="1"/></w:r>`
      ]
    ])('큰 각주를 수천 번 가리켜도(%s) 한 번만 그린다', async (name, ref) => {
      const files = withNotes(Array.from({ length: 3000 }, (_, i) => ref(i)).join(''), big)
      const { text } = await docxText(writeZip(join(dir, `notes-${name}.docx`), files))
      expect(times(text)).toBe(1)
    })

    it('각주 정의를 주석·미끼로 감춰도 한 번만 그린다', async () => {
      const ref = '<w:r><w:footnoteReference w:id="1"/></w:r>'
      const hidden = big.replace('<w:p>', '<!-- <w:footnote w:id="99" --><w:p>')
      const decoys = Array.from({ length: 3000 }, (_, i) => note(i + 2, '')).join('')
      const files = withNotes(ref.repeat(3000), hidden + decoys)
      const { text } = await docxText(writeZip(join(dir, 'notes-hidden.docx'), files))
      expect(times(text)).toBe(1)
    })
  })

  it('zip 이 아니면 던진다', async () => {
    const path = join(dir, 'broken.docx')
    writeFileSync(path, 'not a zip')
    await expect(docxText(path)).rejects.toThrow()
  })

  it('긴 문서는 같은 상한에서 자르고 같은 문장을 붙인다', async () => {
    const path = docx(dir, 'long.docx', wP('가'.repeat(CLIP_TEXT_LIMIT + 10)))
    const { text } = await docxText(path)
    expect(text.startsWith('가'.repeat(CLIP_TEXT_LIMIT))).toBe(true)
    expect(text.endsWith(CLIP_CUT_NOTE)).toBe(true)
  })

  it('변환기에 넘기기엔 너무 큰 HTML 은 잘라서 옮기고 잘린 표시를 붙인다', async () => {
    const path = docx(dir, 'huge-html.docx', wP('가'.repeat(CLIP_TEXT_LIMIT * 10 + 10)))
    const { text } = await docxText(path)
    expect(text.startsWith('가'.repeat(CLIP_TEXT_LIMIT))).toBe(true)
    expect(text.endsWith(CLIP_CUT_NOTE)).toBe(true)
  })
})
