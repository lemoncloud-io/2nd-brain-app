// 오늘 띠·빈 탭·문서 자리 알림 — 오늘 노트로 가는 길과 탭에서 바로 할 수 있는 일(renderer views)
export const today = {
  /** 날짜를 못 읽은 노트 이름이면 date 가 null 이다 */
  previousLeft: (date: string | null, n: number): string => `${date ?? '지난'} 노트에 남은 일 ${n}`,
  backToToday: '오늘 노트로',
  previousHint: (rel: string): string => `${rel} — 아직 안 끝난 첫 자리로 가요`,
  progress: '오늘 할 일',
  progressSr: (total: number, done: number): string => `오늘 할 일 ${total}개 중 ${done}개 완료`,
  wrapUp: '채팅으로 오늘 정리하기',
  wrapUpHint:
    '옆 채팅 입력칸에 정리 요청 문장을 채워요. 쓰던 글이 있으면 뒤에 덧붙여요. 읽어 보고 Enter로 보내 주세요',
  blank: {
    createToday: '오늘 노트 만들기',
    createFilled: (note: string): string => `${note} — Enter로 보내면 만들어요`,
    openToday: '오늘 노트 열기',
    find: '문서 찾아 열기',
    newNote: '새 노트 만들기',
    close: '이 탭 닫기',
    firstTime: '처음이세요? 시작하기 보기'
  },
  docOpened: (folder: string): string => `${folder} 문서를 열었어요`
}
