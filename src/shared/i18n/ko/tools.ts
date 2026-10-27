// 채팅 도구 말 — 진행 한 줄·승인 카드·권한 모드(renderer lib/tool-text.ts)
export const tools = {
  mcp: '연결 도구를 써요',
  ai: 'AI 도구를 써요',
  permissionTitle: 'AI가 도구를 쓰려고 해요 — 허용할까요?',
  allowCommand: '이 명령은 이 대화에서 계속 허용',
  allowTool: '이 대화에서 계속 허용',
  mode: {
    ask: { label: '물어보기', hint: '허용 범위 밖 도구는 매번 물어봐요' },
    edits: { label: '파일 고치기는 바로', hint: '파일 고치기는 묻지 않고 바로 해요' },
    all: { label: '전부 바로', hint: '묻지 않고 바로 실행해요 — 주의가 필요해요' }
  }
}
