// 답이 실제로 기댄 문서 — 앱이 프롬프트에 실은 문서 중 답이 경로로 인용한 것만 고른다.
// 실은 문서 전부를 칩으로 보이면 "참고한 문서" 가 아니라 "검색 후보" 가 된다(사람 확인 2026-10-23)

// 경로에 이어 붙을 수 있는 글자 — 앞뒤가 이것이면 더 긴 다른 경로의 일부다
const PATH_CHAR = /[\p{L}\p{N}_@.\-/]/u

const isBoundary = (ch: string | undefined): boolean => ch === undefined || !PATH_CHAR.test(ch)

const citesAt = (text: string, needle: string): boolean => {
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) {
    if (isBoundary(text[at - 1]) && isBoundary(text[at + needle.length])) return true
  }
  return false
}

/**
 * `candidates` 중 `text` 가 보관함 상대경로로 적은 것, candidates 순서대로.
 * 모델은 한글 파일명을 합친 꼴(NFC)로 적는다 — 양쪽을 NFC 로 접어 비교한다. `.md` 를 뗀 꼴도 인용으로 본다
 */
export const citedRels = (text: string, candidates: readonly string[]): string[] => {
  const body = text.normalize('NFC')
  return candidates.filter((rel) => {
    const path = rel.normalize('NFC')
    return citesAt(body, path) || (path.endsWith('.md') && citesAt(body, path.slice(0, -3)))
  })
}
