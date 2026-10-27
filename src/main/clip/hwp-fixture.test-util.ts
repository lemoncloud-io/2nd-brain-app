// 테스트 전용 — 최소 HWP 5.0 을 만든다. 실물 한글 문서는 개인·고객사 정보라 커밋하지 않는다.
// 구조(한컴 "한글문서파일형식 5.0"): CFB 안에 FileHeader(256B, 서명·버전·압축 플래그) ·
// DocInfo(레코드, raw deflate) · BodyText/Section0(레코드, raw deflate).
// 레코드 헤더 = tag(10bit) | level(10bit) | size(12bit). 문단 = PARA_HEADER(66) + PARA_TEXT(67, UTF-16LE, 끝 0x0D).
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import CFB from 'cfb'
import { deflateRaw } from 'pako'

const record = (tag: number, level: number, body: Buffer): Buffer => {
  const head = Buffer.alloc(4)
  head.writeUInt32LE((tag & 0x3ff) | ((level & 0x3ff) << 10) | (body.length << 20), 0)
  return Buffer.concat([head, body])
}
const u32 = (...ns: number[]): Buffer => {
  const b = Buffer.alloc(4 * ns.length)
  ns.forEach((n, i) => b.writeUInt32LE(n >>> 0, 4 * i))
  return b
}
const u16 = (...ns: number[]): Buffer => {
  const b = Buffer.alloc(2 * ns.length)
  ns.forEach((n, i) => b.writeUInt16LE(n, 2 * i))
  return b
}
const paragraph = (text: string): Buffer => {
  const chars = Buffer.from(`${text}\r`, 'utf16le')
  const head = Buffer.concat([
    u32((text.length + 1) | 0x80000000),
    u32(0),
    u16(0, 0),
    u32(0),
    u16(0),
    u16(0),
    u32(0)
  ])
  return Buffer.concat([record(66, 0, head), record(67, 1, chars)])
}

export const writeHwp = (dir: string, name: string, paragraphs: string[]): string => {
  const header = Buffer.alloc(256)
  header.write('HWP Document File', 0, 'latin1')
  header.writeUInt32LE(0x05000300, 32)
  header.writeUInt32LE(1, 36) // 압축
  const docProps = Buffer.alloc(26)
  docProps.writeUInt16LE(1, 0) // 섹션 수
  const cfb = CFB.utils.cfb_new()
  CFB.utils.cfb_add(cfb, '/FileHeader', header)
  CFB.utils.cfb_add(cfb, '/DocInfo', Buffer.from(deflateRaw(record(0x10, 0, docProps))))
  CFB.utils.cfb_add(
    cfb,
    '/BodyText/Section0',
    Buffer.from(deflateRaw(Buffer.concat(paragraphs.map(paragraph))))
  )
  const path = join(dir, name)
  writeFileSync(path, CFB.write(cfb, { type: 'buffer' }) as Buffer)
  return path
}
