// main 채팅이 화면으로 보내는 알림·오류 — 대화·압축·선택 영역 고치기·웹 주소 읽기(main/chat)
export const chatService = {
  searchFailed:
    '보관함을 검색하지 못해 참고한 페이지 없이 답했어요 — 답이 부족하면 다시 물어봐 주세요',
  sourceOnlyEmpty: '위키를 빼고 찾았더니 참고할 문서가 없어요 — 토글을 끄고 다시 물어봐 주세요',
  resumeFailed: '이전 대화를 이어가지 못해 새로 물었어요 — AI는 앞의 내용을 기억하지 못해요',
  runFailed: 'AI를 실행하지 못했어요 — 설정에서 AI 연결 상태를 확인한 뒤 다시 물어봐 주세요',
  runFailedRetry: 'AI를 실행하지 못했어요 — 설정에서 AI 연결 상태를 확인한 뒤 다시 시도해 주세요',
  runFailedPress: 'AI를 실행하지 못했어요. 설정에서 AI 연결 상태를 확인한 뒤 다시 눌러 주세요',
  filesUnchecked: 'AI가 쓴 파일을 확인하지 못했어요 — 보관함에서 직접 확인해 주세요',
  keptPrevious: '새 답을 받지 못해 앞의 답을 그대로 두었어요',
  saveFailed: '답을 저장하지 못했어요 — 앱을 다시 켜면 이 답이 보이지 않을 수 있어요',
  noConversation: '없는 대화예요',
  busy: '이미 진행 중인 질문이 있어요',
  nothingToRegenerate: '다시 답할 질문이 없어요',
  filesRemain: '이 답이 만든 파일이 아직 있어요 — 답 아래 카드에서 되돌린 뒤 다시 답하게 해 주세요',
  nothingToCompact: '아직 이어갈 대화가 없어요',
  compactFailed: '대화를 압축하지 못했어요 — 그대로 이어서 물어봐도 돼요',
  inline: {
    noSelection: '고칠 글을 먼저 골라 주세요',
    tooLong: '고른 글이 너무 길어요 — 나눠서 고쳐 주세요',
    noInstruction: '어떻게 고칠지 적어 주세요',
    canceled: '고치기를 멈췄어요',
    unreadable: 'AI가 고친 글을 알아볼 수 없어요 — 다시 눌러 주세요'
  },
  web: {
    tooMany: (n: number): string =>
      `웹 주소는 한 번에 ${n}개까지 읽어요 — 나머지는 따로 물어봐 주세요`,
    notText: '웹 페이지나 글이 아닌 주소라 읽지 못했어요 — PDF·그림은 자료로 넣은 뒤 물어봐 주세요',
    noText: '웹 주소에서 읽을 글을 찾지 못했어요 — 내용을 복사해 질문에 붙여 넣어 주세요',
    offline: '웹 주소에 연결하지 못했어요 — 주소와 인터넷 연결을 확인해 주세요',
    redirects:
      '웹 주소가 다른 곳으로 너무 여러 번 넘어가 읽지 못했어요 — 최종 주소로 다시 물어봐 주세요',
    tooBig:
      '웹 페이지가 너무 커서 읽지 못했어요 — 필요한 부분의 내용을 복사해 질문에 붙여 넣어 주세요',
    timeout: (seconds: number): string =>
      `웹 주소가 ${seconds}초 안에 응답하지 않아 읽지 못했어요 — 잠시 뒤 다시 물어봐 주세요`,
    inside: '이 컴퓨터나 사내망 안쪽 주소는 읽지 않아요 — 내용을 복사해 질문에 붙여 넣어 주세요',
    refused: (status: number): string =>
      `웹 주소를 읽지 못했어요 (HTTP ${status}) — 로그인해야 보이는 페이지면 내용을 복사해 질문에 붙여 넣어 주세요`
  },
  otherVaultEditing: '다른 보관함에서 글을 고치고 있어요. 끝난 뒤 다시 눌러 주세요',
  otherEditing: '다른 글을 고치고 있어요. 끝난 뒤 다시 눌러 주세요',
  changesFailed: '바뀐 곳을 읽지 못했어요'
}
