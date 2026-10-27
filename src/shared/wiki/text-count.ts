// 글 분량 세기 — 편집기 아래 줄(Obsidian Word count). 순수.
// 읽는 사람이 보는 글만 센다: 맨 위 속성·꾸밈 기호·링크 주소·임베드는 빼고, 링크는 보이는 글자로 센다.
// 글자는 공백을 넣어 센다(원고 분량을 세는 흔한 방식), 줄바꿈은 뺀다. 단어는 띄어 쓴 덩어리(한국어는 어절)다.
import { frontmatterLength } from './parse'

export type TextCount = { chars: number; words: number }

/** 마크다운에서 보이는 글만 남긴다 — 줄 구조는 둔다 */
const visibleText = (markdown: string): string =>
  markdown
    .slice(frontmatterLength(markdown))
    .normalize('NFC')
    .replace(/<!--[\s\S]*?-->/g, '')
    // 코드 펜스 줄(``` · ~~~)은 기호다 — 안의 코드는 센다
    .replace(/^\s*(```|~~~).*$/gm, '')
    // 임베드·그림은 글이 아니다
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // [[대상|별칭]] → 별칭, [[대상#절]] → 대상#절, [글](주소) → 글
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 줄머리 기호 — 제목 #, 인용 >, 목록 - * + 1., 체크박스 [ ]
    .replace(/^[ \t]*(>[ \t]?)*/gm, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*([-*+]|\d+[.)])[ \t]+(\[[ xX]\][ \t]+)?/gm, '')
    // 가로줄
    .replace(/^[ \t]*([-*_][ \t]*){3,}$/gm, '')
    // 강조·코드 표시
    .replace(/(\*\*|__|~~|==|`)/g, '')

export const countText = (markdown: string): TextCount => {
  const text = visibleText(markdown)
  // 기호를 지운 자리에 남은 겹친 공백은 하나로 — 사람 눈에는 한 칸이다
  const lines = text.split('\n').map((line) => line.trim().replace(/\s+/g, ' '))
  const chars = lines.reduce((sum, line) => sum + Array.from(line).length, 0)
  const words = text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length
  return { chars, words }
}
