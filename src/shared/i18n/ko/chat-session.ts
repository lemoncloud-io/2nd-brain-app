// 켜 두는 채팅 세션 — 화면으로 가는 오류(main chat/session/)
export const chatSession = {
  died: 'AI가 답하는 중에 멈췄어요 — 다시 물어봐 주세요',
  busy: '이미 진행 중인 질문이 있어요',
  claudeStartFailed:
    'Claude를 시작하지 못했어요 — Claude를 최신으로 업데이트한 뒤 다시 물어봐 주세요',
  claudeConnectFailed: 'AI를 실행하지 못했어요 — 앱을 다시 켠 뒤 다시 물어봐 주세요',
  codexUpdateRequired:
    'Codex를 시작하지 못했어요 — Codex를 최신으로 업데이트한 뒤 다시 물어봐 주세요'
}
