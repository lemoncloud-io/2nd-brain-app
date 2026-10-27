// 리더 "찾기" 의 일치 계산 — 순수. NFC 정규화, 대소문자 무시(글자 수가 변하지 않을 때만), 글자 그대로(정규식 아님).
// 오프셋은 **NFC 로 정규화한 원문** 기준이다 — 호출자는 `text.normalize('NFC')` 를 그 오프셋으로 자른다.
// 소문자화가 길이를 바꾸는 글자(İ 등)가 있으면 그 문장은 대소문자를 구분해 찾는다 — 자리가 밀리는 것보다 낫다.

export type FindRange = { start: number; end: number }

// 호출자가 일치마다 mark 노드를 만든다 — 상한 없이 두면 1~2글자 찾기가 긴 문서에서 DOM을 폭발시킨다
const MAX_MATCHES = 2_000

const foldable = (nfc: string): boolean => nfc.toLowerCase().length === nfc.length

/** `text` 안에서 `query` 가 나오는 자리(겹치지 않게, 앞에서부터, 최대 2,000개). 빈 질의는 0개 */
export function findInText(text: string, query: string): FindRange[] {
  const nfc = text.normalize('NFC')
  const q = query.normalize('NFC')
  if (q === '') return []
  const insensitive = foldable(nfc)
  const hay = insensitive ? nfc.toLowerCase() : nfc
  const needle = insensitive ? q.toLowerCase() : q
  const out: FindRange[] = []
  let at = hay.indexOf(needle)
  while (at !== -1 && out.length < MAX_MATCHES) {
    out.push({ start: at, end: at + needle.length })
    at = hay.indexOf(needle, at + needle.length)
  }
  return out
}
