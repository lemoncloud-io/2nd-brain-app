/** 이 크기를 넘으면 다시 들여쓰지 않는다 — 원문·파싱값·결과·편집기 문서를 한 번에 들면 창이 멈춘다 */
const PRETTY_LIMIT = 2 * 1024 * 1024

/** 보기 좋게 다시 들여쓴 json — 깨졌거나 너무 크면 원문과 그 사실. 미리보기가 원문을 그릴 때 쓴다 */
export const prettyJson = (text: string): { text: string; broken: boolean; tooBig?: true } => {
  if (text.length > PRETTY_LIMIT) return { text, broken: false, tooBig: true }
  try {
    return { text: JSON.stringify(JSON.parse(text), null, 2), broken: false }
  } catch {
    return { text, broken: true }
  }
}
