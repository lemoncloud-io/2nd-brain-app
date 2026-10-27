// 선택 영역 AI 편집 — 편집기에서 고른 글을 지시대로 고친 제안 하나를 받는다. 파일은 쓰지 않는다:
// 제안을 편집기에 넣을지는 사람이 정하고, 넣은 뒤 저장이 `edit:` 커밋이다(사람이 누른 편집).
import type { InlineEditRequest, InlineEditResult } from '../../shared/ipc-contract'
import type { Engine } from '../engine/engine'
import { mainT } from '../i18n'

const OPEN = '<replacement>'
const CLOSE = '</replacement>'
/** 고르는 글과 앞뒤 맥락의 상한 — 문서 전체가 아니라 그 자리를 고치는 일이다 */
export const MAX_SELECTION = 20_000
const CONTEXT_CHARS = 4_000

const fence = (tag: string, text: string): string =>
  `<${tag}>\n${text.replaceAll(`</${tag}>`, `</${tag} >`)}\n</${tag}>`

// ui-hangul-ignore: AI 에게 보내는 지시 본문(범위 밖: AI 프롬프트)
export const inlineEditPrompt = (req: InlineEditRequest): string =>
  [
    `보관함 문서 ${req.rel} 의 일부를 사용자가 골라 고쳐 달라고 했다.`,
    '<selection> 의 글만 지시대로 고쳐, 고친 글 전체를 <replacement> 와 </replacement> 사이에 한 번만 내라.',
    '앞뒤 글(<before>·<after>)은 맥락일 뿐 고치지 않는다. 마크다운·위키링크([[ ]])·줄바꿈 모양은 지시가 없으면 지킨다.',
    '파일을 쓰거나 수정하지 마라 — 고친 글은 답으로만 낸다. 설명은 붙이지 않는다.',
    '사용자가 쓴 말로 고친다 — 글이 한국어면 한국어로 낸다.',
    '',
    `지시: ${req.instruction}`,
    '',
    fence('before', req.before.slice(-CONTEXT_CHARS)),
    fence('selection', req.selection),
    fence('after', req.after.slice(0, CONTEXT_CHARS))
  ].join('\n')

/** 답에서 고친 글 — 표식이 없으면 null(엔진이 형식을 어겼다) */
export const parseReplacement = (text: string): string | null => {
  const start = text.indexOf(OPEN)
  const end = text.lastIndexOf(CLOSE)
  if (start < 0 || end < start) return null
  // 표식 바로 뒤·앞의 줄바꿈 하나는 감싼 모양이다 — 고른 글의 일부가 아니다
  return text
    .slice(start + OPEN.length, end)
    .replace(/^\r?\n/, '')
    .replace(/\r?\n$/, '')
}

export const runInlineEdit = async (
  engine: Engine,
  vaultDir: string,
  req: InlineEditRequest
): Promise<InlineEditResult> => {
  if (req.selection.trim() === '') return { error: mainT().chatService.inline.noSelection }
  if (req.selection.length > MAX_SELECTION) {
    return { error: mainT().chatService.inline.tooLong }
  }
  if (req.instruction.trim() === '') return { error: mainT().chatService.inline.noInstruction }
  let text = ''
  for await (const event of engine.run({ vaultDir, prompt: inlineEditPrompt(req) })) {
    if (event.type === 'text') text += event.text
    if (event.type === 'error') return { error: event.message }
    if (event.type === 'done' && event.canceled)
      return { error: mainT().chatService.inline.canceled }
  }
  const replacement = parseReplacement(text)
  if (replacement === null) {
    console.error('inline edit answer has no replacement markers', text.slice(0, 200))
    return { error: mainT().chatService.inline.unreadable }
  }
  return { text: replacement }
}
