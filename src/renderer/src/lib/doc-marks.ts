// 리더의 "바뀐 곳" 자리 계산 — 바뀐 문단의 여백 막대와 지운 글이 붙을 줄.
// main 이 준 줄 번호는 원문 기준이고 리더는 frontmatter·제목을 뺀 본문을 그린다 — 그만큼 당겨 쓴다.
import type { DocChanges } from '../../../shared/ipc-contract'

export type LineRange = { from: number; to: number }

/** 지운 글이 붙을 자리 — 그 문단 앞이나(그 뒤에 글이 남았다) 뒤(문서 끝에서 지웠다) */
export type Fold = { anchor: number; where: 'before' | 'after'; text: string }

export type Marks = {
  added: LineRange[]
  folds: Fold[]
  /** 본문 밖(속성 블록·따로 그리는 제목)에서만 바뀌어 그릴 수 없는 곳의 수 — 0 이 아니면 "없다" 고 말하지 않는다 */
  outside: number
}

/**
 * @param text 리더가 그리는 본문
 * @param offset 원문에서 떼어 낸 앞부분 줄 수
 */
export const marksFor = (
  text: string,
  changes: Pick<DocChanges, 'added' | 'removed'>,
  offset: number
): Marks => {
  const lines = text.split('\n')
  const filled = (line: number): boolean => (lines[line - 1] ?? '').trim() !== ''
  let outside = 0
  const added = changes.added
    .map(({ from, to }) => ({ from: from - offset, to: to - offset }))
    .filter((range) => {
      if (range.to >= 1) return true
      outside += 1
      return false
    })
    .map((range) => ({ from: Math.max(1, range.from), to: range.to }))

  const folds = changes.removed.flatMap(({ after, text: gone }): Fold[] => {
    const at = after - offset
    // 본문 앞에서 지운 줄은 본문 첫 문단 앞에 붙이면 거짓말이 된다 — 세어서 알리기만 한다
    if (at < 0) {
      outside += 1
      return []
    }
    return [fold(lines, filled, at, gone)]
  })
  return { added, folds, outside }
}

const fold = (
  lines: string[],
  filled: (line: number) => boolean,
  at: number,
  gone: string
): Fold => {
  // 지운 자리 다음에 남은 글이 있으면 그 앞에 — 빈 줄을 건너뛰어 문단 첫 줄을 찾는다
  for (let line = at + 1; line <= lines.length; line += 1) {
    if (filled(line)) return { anchor: line, where: 'before', text: gone }
  }
  for (let line = Math.min(at, lines.length); line >= 1; line -= 1) {
    if (filled(line)) return { anchor: line, where: 'after', text: gone }
  }
  return { anchor: 1, where: 'before', text: gone }
}

export const isChanged = (marks: Marks, from: number, to: number): boolean =>
  marks.added.some((range) => range.from <= to && range.to >= from)

export const foldsIn = (marks: Marks, from: number, to: number, where: Fold['where']): Fold[] =>
  marks.folds.filter((it) => it.where === where && it.anchor >= from && it.anchor <= to)

/** 그릴 것이 하나도 없다 — 화면에 "바뀐 곳이 없다" 를 띄울지 가린다 */
export const nothingMarked = (marks: Marks): boolean =>
  marks.added.length === 0 && marks.folds.length === 0
