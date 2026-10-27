import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pptxText } from './pptx-text'
import { CLIP_CUT_NOTE, CLIP_TEXT_LIMIT, ZIP_INFLATE_LIMIT } from './clip-text'
import { aP, pGrp, pPic, pptx, pptxFiles, pSp, pTbl, writeZip } from './office-fixture.test-util'
import { mainT } from '../i18n'

describe('pptxText', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('슬라이드마다 제목을 ## 로, 본문 자리의 문단은 단계만큼 들여 쓴 글머리로', async () => {
    const path = pptx(dir, 'deck.pptx', [
      pSp([aP('분기 보고')], 'ctrTitle') + pSp([aP('2026년 3분기')], 'subTitle'),
      pSp([aP('매출')], 'title') +
        pSp([aP('국내'), aP('서울', { lvl: 1 }), aP('해외'), aP('글머리 없음', { bu: 'none' })], '')
    ])
    const { text } = await pptxText(path)
    expect(text).toBe(
      [
        '## 분기 보고',
        '',
        '2026년 3분기',
        '',
        '## 매출',
        '',
        '- 국내\n  - 서울\n- 해외',
        '',
        '글머리 없음'
      ].join('\n')
    )
  })

  it('글상자 문단은 글머리 없이, 글머리 표시가 있으면 글머리로', async () => {
    const path = pptx(dir, 'textbox.pptx', [
      pSp([aP('제목')], 'title') + pSp([aP('메모 한 줄'), aP('표시된 항목', { bu: 'char' })])
    ])
    expect((await pptxText(path)).text).toBe('## 제목\n\n메모 한 줄\n\n- 표시된 항목')
  })

  it('발표 순서를 따른다 — 파일 이름 순서(slide10 이 slide2 앞)가 아니다', async () => {
    const path = pptx(
      dir,
      'order.pptx',
      [pSp([aP('첫째')], 'title'), pSp([aP('둘째')], 'title'), pSp([aP('셋째')], 'title')],
      [10, 2, 1]
    )
    expect((await pptxText(path)).text).toBe('## 첫째\n\n## 둘째\n\n## 셋째')
  })

  it('제목 없는 슬라이드는 번호로 이름을 붙이고, 아무것도 없는 슬라이드는 건너뛴다', async () => {
    const path = pptx(dir, 'untitled.pptx', [
      pSp([aP('표지')], 'title'),
      '',
      pSp([aP('제목 없는 내용')])
    ])
    expect((await pptxText(path)).text).toBe('## 표지\n\n## 슬라이드 3\n\n제목 없는 내용')
  })

  it('표는 GFM 표가 되고, 병합으로 가려진 칸은 비운다', async () => {
    const path = pptx(dir, 'table.pptx', [
      pSp([aP('표')], 'title') +
        pTbl([
          [
            { text: '합친 칸', attrs: 'gridSpan="2"' },
            { text: '가려짐', attrs: 'hMerge="1"' }
          ],
          [{ text: '세로', attrs: 'rowSpan="2"' }, '가|나'],
          [{ text: '', attrs: 'vMerge="1"' }, '다'],
          [
            { text: '병합 아님', attrs: 'hMerge="0"' },
            { text: '이것도', attrs: 'vMerge="false"' }
          ]
        ])
    ])
    expect((await pptxText(path)).text).toBe(
      [
        '## 표',
        '',
        '| 합친 칸 |  |',
        '| --- | --- |',
        '| 세로 | 가\\|나 |',
        '|  | 다 |',
        '| 병합 아님 | 이것도 |'
      ].join('\n')
    )
  })

  it('묶은 도형 안의 글도 읽고, 그림은 [IMAGE] 자리만 남기고 개수를 센다', async () => {
    const path = pptx(dir, 'group.pptx', [
      pSp([aP('묶음')], 'title') + pGrp(pSp([aP('안쪽 글')]) + pPic())
    ])
    expect(await pptxText(path)).toEqual({ text: '## 묶음\n\n안쪽 글\n\n[IMAGE]', images: 1 })
  })

  it('그림의 대체 텍스트(descr, 비면 title)는 자리표 안에 남긴다', async () => {
    const path = pptx(dir, 'alt.pptx', [
      pSp([aP('제목')], 'title') +
        pPic('조직도', '안 쓰이는 제목') +
        pPic(undefined, '제목만') +
        pPic(' ', '공백 설명 뒤 제목') +
        pPic('')
    ])
    expect(await pptxText(path)).toEqual({
      text: '## 제목\n\n[IMAGE: 조직도]\n\n[IMAGE: 제목만]\n\n[IMAGE: 공백 설명 뒤 제목]\n\n[IMAGE]',
      images: 4
    })
  })

  it('그림과 대체 텍스트만 있는 발표는 글자 없는 문서다', async () => {
    const path = pptx(dir, 'alt-only.pptx', [pPic('사진 설명')])
    expect(await pptxText(path)).toEqual({ text: '', images: 1 })
  })

  it('날짜·쪽 번호·바닥글 자리는 옮기지 않는다', async () => {
    const path = pptx(dir, 'footer.pptx', [
      pSp([aP('본문')], 'title') +
        pSp([aP('2026-10-02')], 'dt') +
        pSp([aP('7')], 'sldNum') +
        pSp([aP('회사 이름')], 'ftr')
    ])
    expect((await pptxText(path)).text).toBe('## 본문')
  })

  it('슬라이드 XML 이 상한을 넘으면 풀지 않고 던진다', async () => {
    const path = pptx(dir, 'bomb.pptx', [pSp([aP('x'.repeat(ZIP_INFLATE_LIMIT + 1))])])
    await expect(pptxText(path)).rejects.toThrow(mainT().clipMain.zipTooLarge)
  })

  it('DOCTYPE 이 든 슬라이드는 엔티티를 펼치지 않고 던진다', async () => {
    const files = pptxFiles([pSp([aP('글')], 'title')])
    files['ppt/slides/slide1.xml'] = files['ppt/slides/slide1.xml'].replace(
      '?>',
      '?><!DOCTYPE p [<!ENTITY a "aaaa">]>'
    )
    await expect(pptxText(writeZip(join(dir, 'doctype.pptx'), files))).rejects.toThrow(/DOCTYPE/)
  })

  it('발표 목록이 없으면 던진다', async () => {
    const path = writeZip(join(dir, 'empty.pptx'), { '[Content_Types].xml': '<Types/>' })
    await expect(pptxText(path)).rejects.toThrow()
  })

  it('관계 파일이 가리키는 이름이 slideN.xml 이 아니어도 읽는다', async () => {
    const files = pptxFiles([pSp([aP('표지')], 'title')])
    files['ppt/slides/Intro.xml'] = files['ppt/slides/slide1.xml']
    delete files['ppt/slides/slide1.xml']
    files['ppt/_rels/presentation.xml.rels'] = files['ppt/_rels/presentation.xml.rels'].replace(
      'slides/slide1.xml',
      'slides/Intro.xml'
    )
    expect((await pptxText(writeZip(join(dir, 'named.pptx'), files))).text).toBe('## 표지')
  })

  it('발표 목록이 가리키는 슬라이드가 없거나 슬라이드 뼈대가 없으면 던진다', async () => {
    const missing = pptxFiles([pSp([aP('a')], 'title'), pSp([aP('b')], 'title')])
    delete missing['ppt/slides/slide2.xml']
    await expect(pptxText(writeZip(join(dir, 'missing.pptx'), missing))).rejects.toThrow()
    const hollow = pptxFiles([pSp([aP('a')], 'title')])
    hollow['ppt/slides/slide1.xml'] = 'not xml'
    await expect(pptxText(writeZip(join(dir, 'hollow.pptx'), hollow))).rejects.toThrow()
  })

  it('같은 슬라이드를 여러 번 가리켜도 한 번만 읽는다', async () => {
    const files = pptxFiles([pSp([aP('한 번')], 'title')])
    files['ppt/presentation.xml'] = files['ppt/presentation.xml'].replace(
      '<p:sldId id="256" r:id="rId10"/>',
      '<p:sldId id="256" r:id="rId10"/>'.repeat(5)
    )
    expect((await pptxText(writeZip(join(dir, 'repeat.pptx'), files))).text).toBe('## 한 번')
  })

  it('호환용 묶음(mc:AlternateContent) 안의 도형도 읽는다', async () => {
    const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
    const path = pptx(dir, 'alternate.pptx', [
      pSp([aP('제목')], 'title') +
        `<mc:AlternateContent ${MC}><mc:Choice Requires="p14">${pSp([aP('새 도형')])}</mc:Choice><mc:Fallback>${pSp([aP('옛 도형')])}</mc:Fallback></mc:AlternateContent>`
    ])
    expect((await pptxText(path)).text).toBe('## 제목\n\n새 도형')
  })

  it('__proto__ 같은 이름을 가리키는 관계는 슬라이드가 없는 것으로 본다', async () => {
    const files = pptxFiles([pSp([aP('a')], 'title')])
    files['ppt/_rels/presentation.xml.rels'] = files['ppt/_rels/presentation.xml.rels'].replace(
      'Target="slides/slide1.xml"',
      'Target="/__proto__"'
    )
    await expect(pptxText(writeZip(join(dir, 'proto.pptx'), files))).rejects.toThrow(/slide/)
  })

  it('긴 발표는 같은 상한에서 자르고 같은 문장을 붙인다', async () => {
    const path = pptx(dir, 'long.pptx', [pSp([aP('가'.repeat(CLIP_TEXT_LIMIT + 10))], 'title')])
    const { text } = await pptxText(path)
    expect(text.startsWith(`## ${'가'.repeat(CLIP_TEXT_LIMIT - 3)}`)).toBe(true)
    expect(text.endsWith(CLIP_CUT_NOTE)).toBe(true)
  })
})
