// 다른 화면이 채팅 입력칸에 문장을 채운다(보내지 않는다) — 오늘 띠의 오늘 정리하기·빈 탭의 오늘 노트 만들기.
// 쓰던 글은 지우지 않는다: 덮어쓰면 사용자가 적던 질문이 말없이 사라진다.
import { getT } from './i18n'

/** 채운 뒤의 입력칸 글과, 쓰던 글 뒤에 덧붙였는지 */
export const fillDraft = (draft: string, text: string): { next: string; appended: boolean } => {
  const written = draft.trim()
  if (written === '') return { next: text, appended: false }
  // 이미 그 문장이 있으면 두 번 붙이지 않는다
  if (written.includes(text)) return { next: draft, appended: false }
  return { next: `${draft.trimEnd()}\n${text}`, appended: true }
}

/** 채운 곳에 남기는 한 줄 — 일은 옆 칸에서 일어나니 누른 자리에서 알린다 */
export const fillNote = (appended: boolean): string =>
  appended ? getT().chat.filledAppended : getT().chat.filled
