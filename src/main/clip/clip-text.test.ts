import { describe, expect, it } from 'vitest'
import { strToU8, Zip, ZipDeflate, zipSync } from 'fflate'
import { parse as parseYaml } from 'yaml'
import {
  assertZipWithin,
  capText,
  clampInt,
  CLIP_TEXT_LIMIT,
  gfmTable,
  imageMark,
  MAX_TABLE_COLUMNS,
  stripImageMarks,
  yamlScalar
} from './clip-text'
import { mainT } from '../i18n'

describe('capText', () => {
  it('상한 이하는 그대로 돌려준다', () => {
    expect(capText('짧다')).toBe('짧다')
    expect(capText('a'.repeat(CLIP_TEXT_LIMIT))).toBe('a'.repeat(CLIP_TEXT_LIMIT))
  })

  it('상한을 넘으면 앞부분만 남기고 잘렸다는 문장을 붙인다', () => {
    const out = capText('b'.repeat(CLIP_TEXT_LIMIT + 1))
    expect(out).toBe(
      `${'b'.repeat(CLIP_TEXT_LIMIT)}\n\n---\n\n(이 문서는 너무 길어 앞부분만 옮겼다 — 전체는 원본 파일에 그대로 있다)`
    )
  })
})

describe('assertZipWithin', () => {
  it('보통 zip 은 통과하고, 선언 크기 합이 상한을 넘으면 던진다', () => {
    const ok = zipSync({ 'a.xml': strToU8('<a/>') })
    expect(() => assertZipWithin(ok)).not.toThrow()
    expect(() => assertZipWithin(ok, 3)).toThrow(mainT().clipMain.zipTooLarge)
  })

  it('데이터 디스크립터(0x08) 항목도 실제 크기로 재어 통과시키고, 넘으면 던진다', () => {
    // 스트리밍 Zip 은 크기를 미리 모르므로 0x08 플래그 + 데이터 디스크립터로 쓴다 — 실물 오피스 저장본과 같은 모양
    const chunks: Uint8Array[] = []
    const zip = new Zip((error, chunk) => {
      if (error) throw error
      chunks.push(chunk)
    })
    const entry = new ZipDeflate('xl/a.xml')
    zip.add(entry)
    entry.push(strToU8('<a/>'.repeat(100)), true)
    zip.end()
    const total = chunks.reduce((n, c) => n + c.length, 0)
    const data = new Uint8Array(total)
    let at = 0
    for (const c of chunks) {
      data.set(c, at)
      at += c.length
    }
    expect(new DataView(data.buffer).getUint16(6, true) & 0x0008).toBe(0x0008)
    expect(() => assertZipWithin(data)).not.toThrow()
    expect(() => assertZipWithin(data, 100)).toThrow(mainT().clipMain.zipTooLarge)
  })
})

describe('yamlScalar', () => {
  it('보통 제목은 그대로, 줄바꿈·`---`·콜론은 한 줄 따옴표 스칼라로 접는다', () => {
    expect(yamlScalar('회의 메모')).toBe('회의 메모')
    const out = yamlScalar('제목\n---\nmalicious: 1')
    expect(out).not.toContain('\n')
    expect(out).toMatch(/^["']제목 --- malicious: 1["']$/)
  })

  it('80칸 넘는 제목도 한 줄이고, 따옴표가 필요한 긴 제목도 다시 읽힌다', () => {
    const long = '아주 긴 제목 '.repeat(20).trim()
    expect(yamlScalar(long)).toBe(long)
    const quoted = `${'a: b '.repeat(30)}#`
    const out = yamlScalar(quoted)
    expect(out).not.toContain('\n')
    expect(parseYaml(`title: ${out}`)).toEqual({ title: quoted })
  })
})

describe('gfmTable', () => {
  it('행이 수십만인 표도 폭을 재다 던지지 않는다', () => {
    expect(() => gfmTable(Array.from({ length: 300_000 }, () => ['a']))).not.toThrow()
  })

  it('남은 글자 예산을 받으면 그 예산에서 행을 멈춘다', () => {
    const rows = Array.from({ length: 1000 }, () => ['가나다라마바사'])
    expect(gfmTable(rows, 500).length).toBeLessThanOrEqual(600)
  })

  it('열은 MAX_TABLE_COLUMNS 까지만, 행은 글자 상한에 닿으면 멈춘다', () => {
    const wide = gfmTable([Array.from({ length: MAX_TABLE_COLUMNS + 50 }, () => 'a')])
    expect(wide.split('\n')[0].split(' | ')).toHaveLength(MAX_TABLE_COLUMNS)
    const tall = gfmTable(Array.from({ length: 100_000 }, () => ['가나다라마바사']))
    expect(tall.length).toBeLessThanOrEqual(CLIP_TEXT_LIMIT + 100)
  })
})

describe('clampInt', () => {
  it.each([
    [undefined, 1],
    ['', 1],
    ['abc', 1],
    ['-3', 1],
    ['1.9', 1],
    ['3', 3],
    ['Infinity', 64],
    ['2000000000', 64]
  ])('%s → %i (범위 1..64)', (raw, expected) => {
    expect(clampInt(raw, 1, 64)).toBe(expected)
  })
})

describe('imageMark · stripImageMarks', () => {
  it('대체 텍스트가 없거나 비면 [IMAGE] 다', () => {
    expect([imageMark(), imageMark(null), imageMark('  \n ')]).toEqual([
      '[IMAGE]',
      '[IMAGE]',
      '[IMAGE]'
    ])
  })

  it('줄바꿈은 접고 ] 와 | 는 빼고 200자에서 자른다', () => {
    expect(imageMark(' 첫 줄\r\n둘째 ] 줄 | 끝 ')).toBe('[IMAGE: 첫 줄 둘째 줄 끝]')
    expect(imageMark('가'.repeat(500))).toBe(`[IMAGE: ${'가'.repeat(200)}]`)
    // 200번째 글자가 이모지여도 반쪽으로 자르지 않는다
    expect(imageMark(`${'가'.repeat(199)}🚀뒤`)).toBe(`[IMAGE: ${'가'.repeat(199)}🚀]`)
  })

  it('자리표는 대체 텍스트째 걷어 내고 다른 글은 남긴다', () => {
    expect(stripImageMarks('[IMAGE]\n\n[IMAGE: 조직도] 글 [IMAGES] [IMAGE:x]')).toBe(
      '\n\n 글 [IMAGES] [IMAGE:x]'
    )
    // 같은 글로 두 번 불러도 결과가 같다
    expect(stripImageMarks('[IMAGE: 가]')).toBe('')
    expect(stripImageMarks('[IMAGE: 가]')).toBe('')
  })

  it('imageMark 가 만든 자리표는 언제나 stripImageMarks 가 걷어 낸다', () => {
    for (const alt of ['a]b', 'a\nb', '[IMAGE: 안쪽]', '|', 'x'.repeat(300)]) {
      expect(stripImageMarks(imageMark(alt))).toBe('')
    }
  })
})
