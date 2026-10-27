// 조사 붙이기 — 이름·파일명처럼 끝 글자를 모르는 말 뒤에 받침에 맞는 조사를 붙인다 ("문서를", "노트를", "회의록을").
export type Josa = '을/를' | '이/가' | '은/는' | '과/와' | '으로/로'

const HANGUL_FIRST = 0xac00
const HANGUL_LAST = 0xd7a3
const RIEUL = 8

// 숫자는 읽는 소리로 — 0 영 · 1 일 · 3 삼 · 6 육 · 7 칠 · 8 팔 은 받침이 있다 (1·7·8 은 ㄹ 받침)
const DIGIT_JONG: Record<string, number> = {
  '0': 21,
  '1': RIEUL,
  '3': 16,
  '6': 1,
  '7': RIEUL,
  '8': RIEUL
}

/** 끝소리의 받침 번호 — 0 이면 받침 없음. 따옴표·괄호·공백은 건너뛴다 */
const finalJong = (word: string): number => {
  const trimmed = word.replace(/["'”’)\]\s]+$/u, '')
  const last = trimmed.at(-1)
  if (!last) return 0
  const code = last.charCodeAt(0)
  if (code >= HANGUL_FIRST && code <= HANGUL_LAST) return (code - HANGUL_FIRST) % 28
  if (last in DIGIT_JONG) return DIGIT_JONG[last]
  // 영문은 끝소리를 어림한다 — l 은 ㄹ, m·n 은 받침, 나머지는 모음으로 끝난다고 본다
  if (/l$/i.test(trimmed)) return RIEUL
  if (/[mn]$/i.test(trimmed)) return 4
  return 0
}

/** `word` 뒤에 받침에 맞는 조사를 붙여 돌려준다 — josa('회의록', '을/를') === '회의록을' */
export const josa = (word: string, pair: Josa): string => {
  const jong = finalJong(word)
  const [withJong, withoutJong] = pair.split('/')
  if (pair === '으로/로') return word + (jong === 0 || jong === RIEUL ? withoutJong : withJong)
  return word + (jong === 0 ? withoutJong : withJong)
}
