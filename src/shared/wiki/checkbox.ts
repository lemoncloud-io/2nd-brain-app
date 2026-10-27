// 체크박스를 세는 규칙 한 곳 — 오늘 띠·검토 목차(renderer)와 트리 진행 고리(main)가 같이 쓴다.
// 두 벌로 세면 같은 문서를 두고 화면마다 다른 수를 말한다.

/** 체크박스는 목록 항목의 머리에만 있다. `]` 뒤에 공백이 없으면 그냥 글이다(CommonMark 와 같다) */
export const CHECKBOX = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\](?=\s|$)/
export const FENCE = /^\s*(```|~~~)/

export type CheckboxCount = { done: number; total: number }

/**
 * 한 번에 세는 파일 수 상한 — main 이 여기서 자르고(`WikiService.checkboxCounts`),
 * renderer 는 이만큼씩 나눠 묻는다(`use-checkbox-counts.ts`). 두 곳이 갈라지면 잘린 나머지가
 * "체크박스 없음" 으로 캐시에 굳어 고리가 영영 안 뜬다.
 */
export const CHECKBOX_BATCH = 400

/**
 * 코드 블록 밖의 줄만 넘긴다 — 계획 문서에는 명령·YAML 예시가 같이 살고, 그 안의 글자를 세면
 * 진행률이 거짓말을 한다. 울타리는 연 문자(``` 또는 ~~~)가 같아야 닫힌다.
 */
export const eachProseLine = (
  markdown: string,
  visit: (text: string, line: number) => void
): void => {
  let fence: string | null = null
  markdown.split('\n').forEach((text, index) => {
    const mark = FENCE.exec(text)?.[1]
    if (fence !== null) {
      if (mark === fence) fence = null
      return
    }
    if (mark !== undefined) {
      fence = mark
      return
    }
    visit(text, index + 1)
  })
}

/** 그 문서의 체크박스 n/m — 체크박스가 없으면 둘 다 0 이다 */
export const countCheckboxes = (markdown: string): CheckboxCount => {
  let done = 0
  let total = 0
  eachProseLine(markdown, (text) => {
    const box = CHECKBOX.exec(text)
    if (!box) return
    total += 1
    if (box[1] !== ' ') done += 1
  })
  return { done, total }
}
