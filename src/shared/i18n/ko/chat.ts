// 채팅 곁 문구(renderer lib — chat-fill·chat-markdown·today-note)
export const chat = {
  filledAppended: '채팅 입력칸의 쓰던 글 뒤에 덧붙였어요',
  filled: '채팅 입력칸에 채웠어요',
  copyCode: '코드 복사',
  thinkingActive: '생각하는 중',
  thinking: '생각',
  openPath: (rel: string): string => `${rel} 열기`,
  /** 하루를 닫는 문장 — 오늘 한 일을 노트에 남긴다(D7: 화면 언어를 따른다) */
  wrapUpPrompt: '오늘 한 일을 정리해서 오늘 노트를 업데이트해줘'
}
