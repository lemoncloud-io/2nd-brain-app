// Clippings → raw 이동 시점의 파일명 정규화 — docs/raw-layout.md § 파일명 정규화의 결정론 이식.
// 에이전트가 하던 일을 코드가 한다: 이동은 내용 무수정, 이름만 바꾼다.
import { Buffer } from 'node:buffer'

const EXT = '.md'
/** `.md` 포함 상한 */
const MAX_BYTES = 120

const RESERVED = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
])

const SMART: Array<[RegExp, string]> = [
  [/[’‘]/g, "'"],
  [/[“”]/g, "'"],
  [/[—–]/g, '-'],
  [/…/g, '...']
]

const bytes = (s: string): number => Buffer.byteLength(s, 'utf8')

const stripEmoji = (s: string): string =>
  // eslint-disable-next-line no-misleading-character-class -- ZWJ·VS16 연결 시퀀스째 지운다
  s.replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, '')

const truncateWords = (stem: string): string => {
  let kept = stem
  while (bytes(kept + EXT) > MAX_BYTES) {
    const cut = kept.lastIndexOf(' ')
    // 한 단어가 상한을 넘기면 바이트로 자른다 — 그래도 이름은 남는다
    if (cut <= 0) {
      const buf = Buffer.from(kept + EXT, 'utf8').subarray(0, MAX_BYTES - EXT.length)
      kept = buf.toString('utf8')
      break
    }
    kept = kept.slice(0, cut)
  }
  return kept
}

/** 충돌 없는 정규화 이름 — taken 은 raw/ 에 이미 있는 이름들(소문자 비교) */
export const normalizeRawName = (original: string, taken: Set<string>): string => {
  const base = original.endsWith(EXT) ? original.slice(0, -EXT.length) : original
  let stem = base
  for (const [re, to] of SMART) stem = stem.replace(re, to)
  // eslint-disable-next-line no-control-regex -- raw-layout 계약: 제어문자 제거
  stem = stem.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
  stem = stripEmoji(stem)
  stem = stem.replace(/\s+/g, ' ').trim().replace(/[.]+$/u, '')
  if (stem === '') stem = 'note'
  if (RESERVED.has(stem.toUpperCase())) stem = `${stem}-note`
  stem = truncateWords(stem)
  let name = `${stem}${EXT}`
  for (let n = 1; taken.has(name.toLowerCase()); n += 1) {
    const suffixed = `${stem}-${n}`
    name =
      bytes(suffixed + EXT) > MAX_BYTES ? `${truncateWords(suffixed)}${EXT}` : `${suffixed}${EXT}`
  }
  return name.normalize('NFC')
}
