import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import CFB from 'cfb'
import { hwpMarkdownToText, hwpText } from './hwp-text'
import { writeHwp } from './hwp-fixture.test-util'

describe('hwpText', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hwp-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('문단을 한 줄씩 뽑는다', async () => {
    const path = writeHwp(dir, 'doc.hwp', ['첫째 문단', '둘째 문단'])
    expect(await hwpText(path)).toEqual({ text: '첫째 문단\n\n둘째 문단', images: 0 })
  })

  it('그림 링크는 [IMAGE] 로 바꾸고 개수를 센다', () => {
    expect(
      hwpMarkdownToText('앞\n\n![](BinData/image1.png)\n\n![사진](BinData/image2.jpg) 뒤')
    ).toEqual({
      text: '앞\n\n[IMAGE]\n\n[IMAGE] 뒤',
      images: 2
    })
    expect(hwpMarkdownToText('![](BinData/image1.png)')).toEqual({ text: '[IMAGE]', images: 1 })
  })

  it('빈 문서는 빈 글자다', async () => {
    const path = writeHwp(dir, 'empty.hwp', [''])
    expect((await hwpText(path)).text).toBe('')
  })

  it('CFB 가 아니거나 HWP 서명이 없으면 던진다', async () => {
    const notCfb = join(dir, 'broken.hwp')
    writeFileSync(notCfb, 'not a compound file')
    await expect(hwpText(notCfb)).rejects.toThrow()
    const cfb = CFB.utils.cfb_new()
    CFB.utils.cfb_add(cfb, '/Other', Buffer.from('x'))
    const noHeader = join(dir, 'noheader.hwp')
    writeFileSync(noHeader, CFB.write(cfb, { type: 'buffer' }) as Buffer)
    await expect(hwpText(noHeader)).rejects.toThrow()
  })
})
