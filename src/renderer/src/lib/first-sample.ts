// 처음 3걸음의 예시 자료 — 빈 보관함 사용자가 손에 쥘 것 없이 위키화까지 가게 한다.
// 바깥에서 온 글로 취급해 위키화 입력함(Clippings)에 담는다: `saveChatToWiki` → `addText`.
// eredmény 파일명은 main이 날짜 접두사로 짓고 겹치면 번호를 붙인다 — 덮어쓰지 않는다.
// 연타는 버튼의 busy 잠금(ref 가드)이 막고, 넣고 나면 journey를 다시 읽어 3걸음이 다음으로 넘어간다.
import { getT } from './i18n'

// ui-hangul-ignore: 보관함에 넣는 예시 자료 본문 — 볼트 데이터는 화면 언어와 따로 간다(D8)
export const SAMPLE_QUESTION = '시작하기 예시 — 내가 좋아하는 아침 루틴'

// ui-hangul-ignore: 보관함에 넣는 예시 자료 본문(D8)
export const SAMPLE_ANSWER = `# 아침 루틴 메모

올해부터 아침에 30분 일찍 일어나서 이렇게 지내고 있어요.

- [ ] 물 한 잔 마시기
- [ ] 어제 한 일 세 줄로 적기
- [ ] 오늘 할 일 세 가지 고르기

## 왜 이렇게 하나요?

미라클 모닝 책에서 "하루를 시작하는 작은 성공이 다음 일을 쉽게 만든다"는 말을 보고 따라 했어요.
일주일 해 보니 회의 전에 오늘 할 일이 정해져 있어서 마음이 덜 바빠요.

## 다음에 알아볼 것

- [ ] 저녁 루틴도 같은 방식으로 적어 보기
`

export const saveFirstSample = async (): Promise<
  { ok: true; path: string } | { ok: false; reason: string }
> => {
  try {
    const result = await window.api.saveChatToWiki({
      conversationId: 'onboarding',
      question: SAMPLE_QUESTION,
      answer: SAMPLE_ANSWER,
      source: 'onboarding:sample'
    })
    if (result.ok) return { ok: true, path: result.path }
    return { ok: false, reason: result.reason }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : getT().library.sampleFailed
    }
  }
}
