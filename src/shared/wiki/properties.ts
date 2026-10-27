// 속성(frontmatter) 고치기 — 문서 맨 위 `---` 블록의 키 하나를 바꾸거나 지운다.
// 나머지 키의 순서·주석·본문은 그대로 둔다(yaml Document 로 고친다). 블록이 없으면 새로 만든다.
import { Document, isMap, parseDocument } from 'yaml'
import { currentT } from '../i18n'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/

/** 여러 값을 받는 키 — 칸에는 쉼표로 쓰고 파일에는 목록으로 둔다 */
export const LIST_KEYS = new Set(['tags', 'aliases', 'up', 'related', 'sources'])

export type PropertyValue = string | string[]

// 값 없는 키는 `key:` 로 쓴다 — `null` 글자가 파일에 찍히면 Obsidian 속성 칸에 "null" 이 보인다
const NULL_AS_BLANK = { nullStr: '' }

/** 칸에 쓴 글을 파일에 둘 값으로 — 목록 키는 쉼표로 가른다 */
export const valueFromInput = (key: string, input: string): PropertyValue => {
  const trimmed = input.trim()
  if (!LIST_KEYS.has(key)) return trimmed
  return trimmed
    .split(',')
    .map((part) => part.trim().replace(/^#/, ''))
    .filter((part) => part !== '')
}

/** 파일의 값을 칸에 보일 글로 */
export const inputFromValue = (value: unknown): string =>
  Array.isArray(value)
    ? value.map((v) => inputFromValue(v)).join(', ')
    : value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)

/**
 * 칸에서 고칠 수 있는 값인가 — 중첩 객체는 원문 편집으로만 고친다. 목록은 쉼표로 나누는 키(LIST_KEYS)만:
 * 다른 키의 목록을 칸에서 고치면 valueFromInput 이 한 글로 합친다
 */
export const editableValue = (key: string, value: unknown): boolean =>
  value === null ||
  ['string', 'number', 'boolean'].includes(typeof value) ||
  (Array.isArray(value) &&
    LIST_KEYS.has(key) &&
    value.every((v) => ['string', 'number'].includes(typeof v)))

export type PropertyEdit = { ok: true; text: string } | { ok: false; reason: string }

/**
 * `key` 를 `value` 로 둔다. `value` 가 null 이면 키를 지운다. 빈 목록·빈 글도 지운다 —
 * 값 없는 키가 쌓이면 속성 줄이 빈칸으로 찬다.
 */
export const setProperty = (
  text: string,
  key: string,
  value: PropertyValue | null,
  /** 빈 값도 키를 남긴다(`up:`) — 템플릿이 채울 자리로 준 키 */
  opts: { keepEmpty?: boolean } = {}
): PropertyEdit => {
  const name = key.trim()
  if (name === '' || /[:#\n]/.test(name))
    return { ok: false, reason: currentT().wiki.badPropertyName }
  const blank = value === null || value === '' || (Array.isArray(value) && value.length === 0)
  const empty = blank && opts.keepEmpty !== true
  const stored = blank && !Array.isArray(value) ? null : value
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const m = FRONTMATTER_RE.exec(text)
  if (m === null) {
    if (empty) return { ok: true, text }
    const doc = new Document({ [name]: stored })
    return {
      ok: true,
      text: `---${eol}${doc.toString(NULL_AS_BLANK).trimEnd().replace(/\n/g, eol)}${eol}---${eol}${text}`
    }
  }
  const doc = parseDocument(m[1])
  if (doc.errors.length > 0) return { ok: false, reason: currentT().wiki.frontmatterUnreadableFix }
  if (doc.contents !== null && !isMap(doc.contents)) {
    return { ok: false, reason: currentT().wiki.frontmatterNotMapFix }
  }
  if (empty) doc.delete(name)
  else doc.set(name, stored)
  const body = text.slice(m[0].length)
  const yaml =
    doc.contents === null || (isMap(doc.contents) && doc.contents.items.length === 0)
      ? ''
      : doc.toString(NULL_AS_BLANK).trimEnd().replace(/\r?\n/g, eol)
  if (yaml === '') return { ok: true, text: body.replace(/^\r?\n/, '') }
  return { ok: true, text: `---${eol}${yaml}${eol}---${eol}${body}` }
}
