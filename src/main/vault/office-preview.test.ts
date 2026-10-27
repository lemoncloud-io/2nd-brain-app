// 워드·파워포인트 미리보기 HTML — 글자는 이스케이프되고, 그림은 ppt/media 안의 것만 data: 로 실린다.
import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { officePreviewHtml } from './office-preview'
import { aP, docx, pptx, pptxFiles, pSp, wP, writeZip } from '../clip/office-fixture.test-util'

const OD = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"'

/** 슬라이드 그림 — r:embed 가 슬라이드 관계 파일의 Id 를 가리킨다 */
const pic = (embed: string, alt: string): string =>
  `<p:pic><p:nvPicPr><p:cNvPr id="4" name="그림" descr="${alt}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip xmlns:r="${OD}" r:embed="${embed}"/></p:blipFill><p:spPr/></p:pic>`

const slideRels = (rels: [id: string, target: string, external?: boolean][]): string =>
  `<Relationships ${REL}>${rels
    .map(
      ([id, target, external]) =>
        `<Relationship Id="${id}" Type="${OD}/image" Target="${target}"${external ? ' TargetMode="External"' : ''}/>`
    )
    .join('')}</Relationships>`

const base64 = (text: string): string => Buffer.from(text).toString('base64')

describe('officePreviewHtml', () => {
  const dir = mkdtempSync(join(tmpdir(), 'office-preview-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('워드 — 제목·본문을 HTML 로, 문서 속 <script> 는 글자로만 남는다', async () => {
    const path = docx(
      dir,
      'a.docx',
      wP('보고', { style: 'Heading1' }) + wP('본문 &lt;script&gt;alert(1)&lt;/script&gt;')
    )
    const html = await officePreviewHtml(path)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<h1>보고</h1>')
    expect(html).toContain('본문 &lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script')
  })

  it('파워포인트 — 발표 순서대로 슬라이드마다 section, 제목·글은 이스케이프', async () => {
    const path = pptx(dir, 'a.pptx', [
      pSp([aP('첫 장')], 'title') + pSp([aP('&lt;img src=x onerror=alert(1)&gt;')], ''),
      pSp([aP('둘째 장 본문')])
    ])
    const html = await officePreviewHtml(path)
    const sections = html.match(/<section>.*?<\/section>/g) ?? []
    expect(sections).toHaveLength(2)
    expect(sections[0]).toContain('<h2>첫 장</h2>')
    expect(sections[0]).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(sections[1]).toContain('둘째 장 본문')
    expect(html).not.toMatch(/<img src=x/)
  })

  it('파워포인트 그림 — ppt/media 안의 것은 data: 로 싣고, 밖·바깥 주소·모르는 형식은 자리표로 남긴다', async () => {
    const path = writeZip(
      join(dir, 'pics.pptx'),
      pptxFiles(
        [
          pic('rIdOk', '차트') +
            pic('rIdOut', '밖') +
            pic('rIdWeb', '웹') +
            pic('rIdEmf', '도형') +
            pic('rIdNone', '없음')
        ],
        [1],
        {
          'ppt/slides/_rels/slide1.xml.rels': slideRels([
            ['rIdOk', '../media/image1.png'],
            ['rIdOut', '../../docProps/app.png'],
            ['rIdWeb', 'https://example.com/x.png', true],
            ['rIdEmf', '../media/image2.emf']
          ]),
          'ppt/media/image1.png': 'png bytes',
          'ppt/media/image2.emf': 'emf bytes',
          'docProps/app.png': 'secret'
        }
      )
    )
    const html = await officePreviewHtml(path)
    expect(html).toContain(`<img src="data:image/png;base64,${base64('png bytes')}" alt="차트">`)
    expect(html.match(/<img /g)).toHaveLength(1)
    expect(html).not.toContain(base64('secret'))
    expect(html).not.toContain('example.com')
    for (const alt of ['밖', '웹', '도형', '없음']) expect(html).toContain(`<p>[IMAGE: ${alt}]</p>`)
  })

  it('글자 상한에서 멈추면 몇 번째 슬라이드부터 빠졌는지 알린다', async () => {
    const long = 'ㄱ'.repeat(70_000)
    const path = pptx(dir, 'long.pptx', [pSp([aP(long)]), pSp([aP(long)]), pSp([aP('끝 장')])])
    const html = await officePreviewHtml(path)
    expect(html.match(/<section>/g)).toHaveLength(2)
    expect(html).not.toContain('끝 장')
    expect(html).toContain('3번째 슬라이드부터는 길어서 여기 싣지 않았어요')
    const short = await officePreviewHtml(pptx(dir, 'short.pptx', [pSp([aP('한 장')])]))
    expect(short).not.toContain('싣지 않았어요')
  })

  it('5MB 넘는 그림은 싣지 않는다', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1)
    const files: Record<string, Uint8Array> = {}
    for (const [name, body] of Object.entries(
      pptxFiles([pic('rIdBig', '큰 그림')], [1], {
        'ppt/slides/_rels/slide1.xml.rels': slideRels([['rIdBig', '../media/big.png']])
      })
    )) {
      files[name] = strToU8(body)
    }
    files['ppt/media/big.png'] = big
    const path = join(dir, 'big.pptx')
    writeFileSync(path, zipSync(files))
    const html = await officePreviewHtml(path)
    expect(html).not.toContain('<img ')
    expect(html).toContain('[IMAGE: 큰 그림]')
  })

  it('손상된 파일·DOCTYPE 이 든 문서는 던진다 — 호출자가 "읽지 못했어요" 로 바꾼다', async () => {
    const broken = join(dir, 'broken.docx')
    writeFileSync(broken, 'not a zip')
    await expect(officePreviewHtml(broken)).rejects.toThrow()
    const doctype = writeZip(
      join(dir, 'doctype.pptx'),
      pptxFiles([pSp([aP('x')])], [1], {
        'ppt/presentation.xml': '<!DOCTYPE x [<!ENTITY a "b">]><p:presentation/>'
      })
    )
    await expect(officePreviewHtml(doctype)).rejects.toThrow()
  })
})
