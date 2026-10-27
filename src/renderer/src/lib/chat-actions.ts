// 대화에서 이어지는 다음 행동 — 답 아래 카드로 뜬다.
//
// 채팅 엔진은 볼트를 읽기만 한다(src/main/chat/prompts.ts) — 파일을 만들거나 승인할 수 없다.
// 그래서 "정리해줘" 를 말로만 답하고 끝나는 대신, 그 일을 실제로 하는 버튼을 답 옆에 붙인다.
// 판정은 사용자가 쓴 말로만 한다: 답 본문으로 고르면 AI 가 예시로 쓴 낱말에 걸린다.
import { getT } from './i18n'

export type ChatActionId = 'ingest' | 'review' | 'lint' | 'clip'

export type ChatAction = { id: ChatActionId; label: string }

// 질문은 두 언어 어느 쪽으로도 올 수 있다 — 화면 언어와 상관없이 둘 다 본다
const RULES: { id: ChatActionId; pattern: RegExp }[] = [
  {
    id: 'ingest',
    pattern:
      /위키화|위키로|페이지로 만들|정리해|정리 해|요약해서 넣|문서로 만들|wikify|into (?:the |a )?wiki|organi[sz]e|into (?:a )?page/i
  },
  {
    id: 'review',
    pattern:
      /승인|검토 기다|넣을 게|확인해야 할 페이지|대기 중인 페이지|approv|waiting (?:for|to) review|pages? to (?:check|review)/i
  },
  {
    id: 'lint',
    pattern:
      /점검|이상한 (?:데|곳)|잘못된 (?:곳|링크)|모순|끊긴 링크|빠진 페이지|\bcheck (?:the )?(?:wiki|library)|broken links?|contradict|missing pages?/i
  },
  {
    id: 'clip',
    pattern:
      /자료 넣|파일 넣|추가하고 싶|올리고 싶|넣고 싶|add (?:a |some )?(?:sources?|files?)|upload/i
  }
]

/** 질문에서 이어질 행동 — 없으면 빈 묶음. 한 번에 최대 2개만 권한다 */
export const suggestActions = (question: string): ChatAction[] =>
  RULES.filter((rule) => rule.pattern.test(question))
    .slice(0, 2)
    .map(({ id }) => ({ id, label: getT().chatActions[id] }))

/**
 * 빈 대화에서 보여 줄 예시 — 무엇을 시켜도 되는지 아는 유일한 단서다.
 * 묻는 말이 아니라 시키는 말이다: 하루 루프의 첫 수(오늘 노트·어제 미결·계획 손질)가 앞에 선다.
 */
export const examplePrompts = (): string[] => getT().chatActions.examples

/** 빈 탭의 "오늘 노트 만들기" 가 채우는 문장 — 예시의 첫 줄 */
export const createTodayPrompt = (): string => examplePrompts()[0]!
