// 토큰 추정 — 컨텍스트 예산이 얼마나 찼는지 재는 유일한 자리.
// 진짜 토크나이저를 들이지 않는 이유: 엔진은 `claude` 또는 `codex` CLI 라 토크나이저가 서로 다르고,
// 어느 쪽도 우리가 부를 수 없다. 예산은 상한이므로 실제보다 많게 세는 쪽으로 기울인다 —
// 적게 세면 예산이 상한 구실을 못 한다.

/** ASCII 는 영어 산문이면 4자, 코드·URL·표가 섞인 마크다운이면 2.5~3자가 1토큰 — 무거운 쪽으로 잡는다 */
export const ASCII_PER_TOKEN = 3
/** 한글·한자 같은 비ASCII 는 대략 1.5자가 1토큰 — ASCII 보다 훨씬 무겁다 */
const WIDE_PER_TOKEN = 1.5

/** 예산 상한을 재는 추정치. 한 글자도 0토큰이 아니도록 올림한다 */
export const estimateTokens = (text: string): number => {
  let ascii = 0
  let wide = 0
  for (const ch of text) {
    if (ch.codePointAt(0)! < 128) ascii += 1
    else wide += 1
  }
  return Math.ceil(ascii / ASCII_PER_TOKEN + wide / WIDE_PER_TOKEN)
}
