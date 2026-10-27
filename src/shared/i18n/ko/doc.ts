// 문서 보기·편집기 곁 문구 — 글자 수·버전·체크박스·속성 칩·다이어그램(renderer lib)
export const doc = {
  count: (chars: string, words: string): string => `${chars}자 · 단어 ${words}개`,
  versionAi: 'AI가 씀',
  versionMe: '내가 고침',
  versionPerson: (author: string): string => `${author} 고침`,
  versionApp: '고침',
  taskDone: '완료',
  taskUndone: '완료 해제',
  task: '할 일',
  propertiesChip: (n: number): string => `속성 ${n}개 · 펼치기`,
  propertiesChipHint: '눌러서 펼쳐요(본문 첫 줄에서 ↑ 도 돼요). 글로 돌아가면 다시 접혀요',
  deletedLines: (n: number): string => `지운 글 ${n}줄`,
  diagramFallback: '다이어그램을 그리지 못해서 원문을 보여 드려요',
  diagramFailed: '그림을 읽지 못했어요',
  readFailed: '자료를 읽지 못했어요',
  tooSlow: '너무 오래 걸렸어요',
  loadFailed: (status: number): string => `불러오지 못했어요 (${status})`
}
