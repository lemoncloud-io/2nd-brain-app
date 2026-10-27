// 대화의 마지막 턴 — 다시 답하기가 무엇을 지우고 무엇을 다시 묻는지 main 과 화면이 같은 규칙으로 본다.
import type { ChatMessage } from './ipc-contract'

/**
 * 글 없이 멈춘 답에 저장하는 표식 — 대화 파일에 이 값으로 남는다(옛 기록과 같은 값).
 * 화면은 이 값을 그대로 보이지 않고 화면 언어의 말로 바꿔 보인다(chat-message-list)
 */
// ui-hangul-ignore: 저장 값 — 화면에는 사전의 chatView.messages.stopped 로 보인다
export const STOPPED_MARK = '(멈춤)'

/** answer 가 null 이면 답이 오지 않은 질문이다(실패) — 지울 것 없이 같은 질문을 다시 보낸다 */
export type LastTurn<M extends ChatMessage = ChatMessage> = { question: string; answer: M | null }

/** 질문 하나와 그 답으로 끝나는 대화의 마지막 턴. 끊긴 실행 카드처럼 답 앞에 질문이 없으면 null */
export const lastTurn = <M extends ChatMessage>(messages: M[]): LastTurn<M> | null => {
  const last = messages.at(-1)
  if (last === undefined) return null
  if (last.role === 'user') return { question: last.text, answer: null }
  const before = messages.at(-2)
  return before?.role === 'user' ? { question: before.text, answer: last } : null
}

/**
 * 이 답이 보관함에 만들거나 고친 파일이 아직 남아 있나 — 남아 있으면 답만 지우고 다시 물을 수 없다.
 * 되돌리기 카드가 답과 함께 사라지고, 새 답이 같은 파일을 한 번 더 쓴다
 */
export const keepsFiles = (answer: ChatMessage | null): boolean => {
  const changes = answer?.changes
  if (changes === undefined || changes.undone === true) return false
  return changes.files.some((file) => file.state !== 'undone')
}

/**
 * 다시 답하기의 새 답을 남길까 — 아니면 앞 답을 되살린다. main 의 저장과 화면이 이 한 규칙으로 판정한다.
 * 끝까지 온(실패·멈춤 아님) 글 있는 답만 남긴다. 파일을 남긴 새 답은 그 되돌리기 카드가 새 답에 있으므로 언제나 남긴다
 */
export const keepsNewAnswer = (
  answer: ChatMessage,
  done: { ok: boolean; canceled: boolean } | null
): boolean => keepsFiles(answer) || (done?.ok === true && !done.canceled && answer.text !== '')
