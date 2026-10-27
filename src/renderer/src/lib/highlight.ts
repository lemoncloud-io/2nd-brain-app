/**
 * 하이라이트 낱말 — 전체 일치가 없으면 `#` 뗀 낱말 중 긴 것부터(공백 분리).
 * 검색은 태그 분리·토큰화인데 하이라이트만 원시 전체 일치라 `#회의`·`회의 예산`이 안 붙는다.
 * `lowerText` 는 미리 낮춘 본문이다 — 대소문자 길이가 바뀌는 글자는 호출자가 보장한다.
 */
export const pickHighlight = (lowerText: string, query: string): string | null => {
  const q = query.trim().toLowerCase()
  if (!q) return null
  if (lowerText.includes(q)) return q
  const words = [
    ...new Set(
      q
        .split(/\s+/)
        .map((w) => w.replace(/^#+/, ''))
        .filter((w) => w !== '')
    )
  ].sort((a, b) => b.length - a.length)
  return words.find((w) => lowerText.includes(w)) ?? null
}
