// 줄 단위 비교 — AI 가 고친 문서를 고친 곳(hunk)으로 나눠 하나씩 두거나 되돌린다.
// 노트 크기(수천 줄)를 전제로 한 LCS 다 — 앞뒤 같은 줄을 먼저 떼고 가운데만 견준다.

export type LineHunk = {
  /** 새 글에서 이 고친 곳이 시작하는 줄(0부터) — 더한 줄이 없으면 지운 자리 */
  start: number
  /** 옛 글에서 시작하는 줄(0부터) */
  oldStart: number
  removed: string[]
  added: string[]
}

/** 가운데 표가 이보다 크면 한 덩어리로 본다 — 메모리를 지킨다 */
const MAX_CELLS = 4_000_000

export const splitLines = (text: string): string[] => text.split('\n')

export const lineHunks = (before: string, after: string): LineHunk[] => {
  const a = splitLines(before)
  const b = splitLines(after)
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1
  let tail = 0
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1
  }
  const midA = a.slice(head, a.length - tail)
  const midB = b.slice(head, b.length - tail)
  if (midA.length === 0 && midB.length === 0) return []
  const n = midA.length
  const m = midB.length
  if (n === 0 || m === 0 || (n + 1) * (m + 1) > MAX_CELLS) {
    return [{ start: head, oldStart: head, removed: midA, added: midB }]
  }

  // lcs[i][j] = midA[i..] 와 midB[j..] 의 가장 긴 공통 줄 수
  const width = m + 1
  const lcs = new Uint32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        midA[i] === midB[j]
          ? lcs[(i + 1) * width + j + 1]! + 1
          : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!)
    }
  }

  const hunks: LineHunk[] = []
  let open: LineHunk | null = null
  let i = 0
  let j = 0
  const hunkAt = (): LineHunk => {
    if (open === null) {
      open = { start: head + j, oldStart: head + i, removed: [], added: [] }
      hunks.push(open)
    }
    return open
  }
  while (i < n || j < m) {
    if (i < n && j < m && midA[i] === midB[j]) {
      open = null
      i += 1
      j += 1
    } else if (j < m && (i === n || lcs[i * width + j + 1]! >= lcs[(i + 1) * width + j]!)) {
      hunkAt().added.push(midB[j]!)
      j += 1
    } else {
      hunkAt().removed.push(midA[i]!)
      i += 1
    }
  }
  return hunks
}

/** 고친 곳 하나를 되돌린 글 — `after` 는 `lineHunks` 를 구한 그 새 글이어야 한다 */
export const revertHunk = (after: string, hunk: LineHunk): string => {
  const lines = splitLines(after)
  lines.splice(hunk.start, hunk.added.length, ...hunk.removed)
  return lines.join('\n')
}
