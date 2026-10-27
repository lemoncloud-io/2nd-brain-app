import { CHECKBOX, eachProseLine } from '../../../shared/wiki/checkbox'

// 계획·노트의 뼈대 — 헤딩 트리와 절마다의 체크박스 n/m. 순수 함수다(읽기만 한다).
//
// 오늘 띠의 "어제 미결 n"·"오늘 할 일 n/m" 과 검토 리더의 목차가 같은 파서를 쓴다.
// 두 벌로 세면 같은 문서를 두고 화면마다 다른 수를 말한다.

export type OutlineSection = {
  text: string
  /** 리더가 그 헤딩에 붙이는 이름표 — 목차가 이것으로 그 절을 찾아간다. 같은 이름이면 `-2`, `-3` */
  id: string
  /** `#` 의 수 (1–6) */
  level: number
  /** 원문에서 그 헤딩이 있는 줄 (1-based) — 눌러서 그 절로 간다 */
  line: number
  done: number
  total: number
}

export type Outline = {
  sections: OutlineSection[]
  /** 문서 전체 — 헤딩 앞의 항목도 든다 */
  done: number
  total: number
}

/** 이름표에 쓸 글자 — 글자·숫자만 남기고 사이는 `-`. 한글도 그대로 쓴다(리더와 목차만 보는 이름이다) */
const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/

export const outlineOf = (markdown: string): Outline => {
  const sections: OutlineSection[] = []
  let done = 0
  let total = 0
  // 같은 이름의 절이 둘이면 뒤엣것에 번호를 붙인다 — 목차가 첫 절로만 보내지 않게
  const used = new Map<string, number>()

  // 코드 블록 안은 글이 아니라 예시다 — 세는 규칙은 shared/wiki/checkbox.ts 한 곳에 있다
  eachProseLine(markdown, (text, line) => {
    const heading = HEADING.exec(text)
    if (heading) {
      // ui-hangul-ignore: 앵커 id 의 대체 글자 — 화면 문구가 아니다(바꾸면 저장된 링크가 끊긴다)
      const base = slug(heading[2]) || '절'
      const seen = (used.get(base) ?? 0) + 1
      used.set(base, seen)
      sections.push({
        text: heading[2],
        id: seen === 1 ? base : `${base}-${seen}`,
        level: heading[1].length,
        line,
        done: 0,
        total: 0
      })
      return
    }
    const box = CHECKBOX.exec(text)
    if (!box) return
    const checked = box[1] !== ' '
    total += 1
    if (checked) done += 1
    const section = sections.at(-1)
    if (!section) return
    section.total += 1
    if (checked) section.done += 1
  })

  return { sections, done, total }
}

/**
 * 체크박스가 전부 끝난 절에서 접을 줄 범위 — "열린 항목만" 이 그리지 않을 자리다.
 * 헤딩 줄은 남긴다: 목차가 그 절을 계속 보여 주므로, 지워 버리면 눌러도 갈 데가 없는 죽은 행이 된다.
 * 범위는 다음 헤딩 앞까지다 — 하위 절은 제 몫을 따로 세니 부모가 자식을 덮지 않는다.
 */
export const closedRanges = (outline: Outline, lineCount: number): { from: number; to: number }[] =>
  outline.sections
    .map((section, index) => ({
      section,
      to: (outline.sections[index + 1]?.line ?? lineCount + 1) - 1
    }))
    .filter(({ section }) => section.total > 0 && section.done === section.total)
    .map(({ section, to }) => ({ from: section.line + 1, to }))

/**
 * 그 줄의 체크박스를 뒤집은 글 — 체크박스 줄이 아니면 `null` 이다(아무것도 쓰지 않는다).
 *
 * 리더가 준 줄 번호는 frontmatter 를 뗀 본문 기준이라 원문과 어긋날 수 있다. 어긋난 줄을 고치면
 * 남의 글이 바뀐다 — 모양이 맞을 때만 쓰고, 아니면 부르는 쪽이 다시 읽는다.
 *
 * @param line 원문에서 1-based 줄 번호
 */
export const toggleCheckbox = (markdown: string, line: number): string | null => {
  const lines = markdown.split('\n')
  const text = lines[line - 1]
  if (text === undefined) return null
  const box = CHECKBOX.exec(text)
  if (!box) return null
  // `box[0]` 은 `]` 로 끝난다 — 표식은 그 바로 앞 한 글자다
  const at = box[0].length - 2
  lines[line - 1] = text.slice(0, at) + (box[1] === ' ' ? 'x' : ' ') + text.slice(at + 1)
  return lines.join('\n')
}
