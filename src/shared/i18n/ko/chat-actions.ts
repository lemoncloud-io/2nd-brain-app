// 답 아래 다음 행동 카드와 빈 대화 예시(renderer lib/chat-actions.ts)
export const chatActions = {
  ingest: '위키 초안 만들기',
  review: '승인할 페이지 보기',
  lint: '점검 실행',
  clip: '자료 넣기',
  /** 묻는 말이 아니라 시키는 말 — 하루 루프의 첫 수(오늘 노트·어제 미결·계획 손질)가 앞에 선다 */
  examples: [
    '오늘 노트 만들어줘',
    '어제 미결만 모아줘',
    '이 계획을 체크리스트로 바꿔줘',
    '넣어 둔 자료를 위키로 정리해줘'
  ]
}
