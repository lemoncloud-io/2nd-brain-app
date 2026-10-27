import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { referencedAttachments, saveAttachment } from './attachments'

const bytes = new Uint8Array([137, 80, 78, 71])
const at = new Date(2026, 8, 22, 9, 5, 7)

describe('saveAttachment', () => {
  it('클립보드 그림(image.png)은 붙인 시각으로 이름을 짓고 attachments/ 에 둔다', () => {
    const vault = mkdtempSync(join(tmpdir(), 'attach-'))
    const saved = saveAttachment(vault, 'image.png', bytes, at)
    expect(saved).toEqual({ ok: true, rel: 'attachments/Pasted image 20260922090507.png' })
    expect(readFileSync(join(vault, 'attachments/Pasted image 20260922090507.png'))).toEqual(
      Buffer.from(bytes)
    )
  })

  it('이름이 겹치면 번호를 붙이고 덮지 않는다', () => {
    const vault = mkdtempSync(join(tmpdir(), 'attach-'))
    expect(saveAttachment(vault, '도식.png', bytes, at)).toEqual({
      ok: true,
      rel: 'attachments/도식.png'
    })
    expect(saveAttachment(vault, '도식.png', bytes, at)).toEqual({
      ok: true,
      rel: 'attachments/도식 1.png'
    })
  })

  it('경로 조각·링크 문법 글자는 이름에서 뺀다 — 보관함 밖으로 못 나간다', () => {
    const vault = mkdtempSync(join(tmpdir(), 'attach-'))
    const saved = saveAttachment(vault, '../../a[b]|c.png', bytes, at)
    expect(saved.ok && saved.rel.startsWith('attachments/')).toBe(true)
    expect(saved.ok && saved.rel.slice('attachments/'.length)).not.toMatch(/[/[\]|]/)
  })

  it('빈 파일·너무 큰 파일은 거절한다', () => {
    const vault = mkdtempSync(join(tmpdir(), 'attach-'))
    expect(saveAttachment(vault, 'a.png', new Uint8Array(), at).ok).toBe(false)
    expect(saveAttachment(vault, 'a.png', new Uint8Array(21 * 1024 * 1024), at).ok).toBe(false)
  })
})

describe('referencedAttachments', () => {
  it('글이 건 attachments/ 파일 중 있는 것만 돌려준다', () => {
    const vault = mkdtempSync(join(tmpdir(), 'attach-'))
    mkdirSync(join(vault, 'attachments'))
    writeFileSync(join(vault, 'attachments', 'a b.png'), 'x')
    writeFileSync(join(vault, 'attachments', 'c.png'), 'x')
    const text =
      '![[attachments/a b.png]]\n![](attachments/c.png)\n![[attachments/없음.png]]\n![[wiki/x.png]]'
    expect(referencedAttachments(vault, text).sort()).toEqual([
      'attachments/a b.png',
      'attachments/c.png'
    ])
  })

  it('밖을 가리키는 포함·깨진 인코딩은 커밋 범위에서 뺀다', () => {
    const vault = mkdtempSync(join(tmpdir(), 'attach-'))
    mkdirSync(join(vault, 'attachments'))
    mkdirSync(join(vault, 'wiki'))
    writeFileSync(join(vault, 'attachments', 'ok.png'), 'x')
    writeFileSync(join(vault, 'wiki', 'x.md'), 'x')
    const text = [
      '![[attachments/ok.png]]',
      '![[attachments/../wiki/x.md]]',
      '![](attachments/%ZZ.png)',
      '![[wiki/y.png]]'
    ].join('\n')
    expect(referencedAttachments(vault, text)).toEqual(['attachments/ok.png'])
  })
})
