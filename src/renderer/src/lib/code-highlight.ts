import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'
import type { Stage } from './graph-3d-look'

// 읽기 칸(CodeView) 구문 색 — CodeMirror 기본 팔레트는 밝은 면 전용이라
// 어두운 면에서 문자열이 읽히지 않는다(짙은 빨강 \#a11). VS Code 명·암 팔레트를
// 본떠 면마다 둔다. 바탕·거터·선택은 main.css 의 토큰(.cm-*) 그대로 쓴다.
const light = HighlightStyle.define([
  { tag: t.keyword, color: '#0000ff' },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: '#000000' },
  { tag: [t.propertyName, t.variableName, t.attributeName], color: '#001080' },
  { tag: [t.function(t.variableName), t.labelName], color: '#795e26' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#267f99' },
  { tag: [t.definition(t.name), t.separator], color: '#000000' },
  {
    tag: [t.typeName, t.className, t.changed, t.annotation, t.modifier, t.self, t.namespace],
    color: '#267f99'
  },
  { tag: t.number, color: '#098658' },
  {
    tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)],
    color: '#000000'
  },
  { tag: [t.meta, t.comment], color: '#008000' },
  { tag: [t.string, t.heading], color: '#a31515' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: '#267f99', textDecoration: 'underline' },
  { tag: t.invalid, color: '#ff0000' }
])

const dark = HighlightStyle.define([
  { tag: t.keyword, color: '#569cd6' },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: '#d4d4d4' },
  { tag: [t.propertyName, t.variableName, t.attributeName], color: '#9cdcfe' },
  { tag: [t.function(t.variableName), t.labelName], color: '#dcdcaa' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#4ec9b0' },
  { tag: [t.definition(t.name), t.separator], color: '#d4d4d4' },
  {
    tag: [t.typeName, t.className, t.changed, t.annotation, t.modifier, t.self, t.namespace],
    color: '#4ec9b0'
  },
  { tag: t.number, color: '#b5cea8' },
  {
    tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)],
    color: '#d4d4d4'
  },
  { tag: [t.meta, t.comment], color: '#6a9955' },
  { tag: [t.string, t.heading], color: '#ce9178' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: '#4ec9b0', textDecoration: 'underline' },
  { tag: t.invalid, color: '#f44747' }
])

/** 면에 맞는 구문 색. basicSetup 의 기본값보다 나중에 깔아 이긴다 */
export const codeHighlight = (stage: Stage): Extension =>
  syntaxHighlighting(stage === 'dark' ? dark : light)
