// 링크 호버 미리보기(`components/link-preview`)에 그릴 본문 — 순수.

/** 미리보기에 그리는 본문 상한(글자) — 긴 페이지를 통째 그리면 호버마다 멈칫한다. 전문은 링크를 눌러 본다 */
export const PREVIEW_MAX_CHARS = 6000

/** 미리보기 본문 — 제목 머리줄이 없으면 붙이고, 길면 상한 앞 줄 경계에서 자른다 */
export const previewText = (body: string, title: string): { text: string; cut: boolean } => {
  const titled = /^\s*#\s/.test(body) ? body : `# ${title}\n\n${body}`
  if (titled.length <= PREVIEW_MAX_CHARS) return { text: titled, cut: false }
  const head = titled.slice(0, PREVIEW_MAX_CHARS)
  const lineEnd = head.lastIndexOf('\n')
  return { text: lineEnd > 0 ? head.slice(0, lineEnd) : head, cut: true }
}
