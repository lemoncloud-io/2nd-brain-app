// 템플릿 넣기 — 보관함 `templates/*.md` 를 지금 문서의 커서 자리에 넣는다(Obsidian 코어 템플릿과 같은 자리 표시).
// `{{title}}`·`{{date}}`·`{{time}}` 을 채우고, 템플릿의 속성 블록은 문서 맨 위 속성에 합친다 —
// 문서에 이미 있는 키는 그대로 둔다(사람이 쓴 값을 템플릿이 덮지 않는다).
import { isMap, parseDocument } from 'yaml'
import { setProperty } from './properties'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/

const pad = (n: number): string => String(n).padStart(2, '0')

export interface TemplateVars {
  title: string
  now: Date
}

/** Obsidian 과 같은 자리 표시를 채운다 — `{{date:YYYY}}` 같은 형식 지정은 날짜 그대로 둔다 */
export const fillTemplate = (template: string, { title, now }: TemplateVars): string => {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  return template
    .replace(/\{\{\s*title\s*\}\}/g, title)
    .replace(/\{\{\s*date(?::[^}]*)?\s*\}\}/g, date)
    .replace(/\{\{\s*time(?::[^}]*)?\s*\}\}/g, time)
}

export type TemplateInsert = { text: string; cursor: number }

/** 문서 `doc` 의 `at` 자리에 채운 템플릿을 넣는다. 돌려주는 cursor 는 넣은 본문의 끝이다 */
export const insertTemplate = (doc: string, at: number, filled: string): TemplateInsert => {
  const tm = FRONTMATTER_RE.exec(filled)
  const body = tm === null ? filled : filled.slice(tm[0].length).replace(/^\r?\n/, '')
  const dm = FRONTMATTER_RE.exec(doc)
  // 속성 블록 안에 커서가 있으면 본문 첫머리에 넣는다 — 속성 사이에 글이 끼면 파일이 깨진다
  const bodyStart = dm === null ? 0 : dm[0].length
  const place = Math.max(at, bodyStart)
  let text = doc.slice(0, place) + body + doc.slice(place)
  let cursor = place + body.length
  if (tm === null) return { text, cursor }

  const parsed = parseDocument(tm[1])
  if (parsed.errors.length > 0 || !isMap(parsed.contents)) return { text, cursor }
  const existing = dm === null ? null : parseDocument(dm[1]).toJS()
  const have = new Set(
    existing !== null && typeof existing === 'object' ? Object.keys(existing as object) : []
  )
  for (const item of parsed.contents.items) {
    const key = String((item.key as { value?: unknown })?.value ?? item.key)
    if (have.has(key)) continue
    const value = (item.value as { toJSON?: () => unknown } | null)?.toJSON?.() ?? null
    const before = text.length
    const next = setProperty(
      text,
      key,
      Array.isArray(value) ? value.map(String) : value === null ? '' : String(value),
      { keepEmpty: true }
    )
    if (!next.ok) continue
    text = next.text
    cursor += text.length - before
  }
  return { text, cursor }
}
