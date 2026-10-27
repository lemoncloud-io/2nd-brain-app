// 지식 관리의 자료 구역과 위키화 탭 — 자료 넣기·기다리는 목록·위키 초안 실행
// (renderer views/sources-section.tsx · pages/ClipSection.tsx · pages/IngestSection.tsx)
export const sources = {
  title: '자료 넣기',
  intro:
    '위키로 만들 자료(파일이나 웹 페이지 주소)를 넣어 주세요. AI가 읽고 위키 페이지 초안을 쓰고, 승인 구역에서 고른 것만 위키에 들어가요.',
  waitingTitle: '위키 초안을 기다리는 자료',
  goIngest: '위키 초안 만들러 가기',
  waitingEmpty: '기다리는 자료가 없어요. 위에서 파일이나 웹 페이지 주소를 넣으면 여기에 모여요',
  backToAdd: '자료 넣기로 올라가기',
  clip: {
    types: '메모·텍스트와 PDF·한글·오피스 문서',
    failed: '넣지 못했어요',
    dropLabel: '파일로 넣기 — Enter를 누르면 파일 고르기가 열려요',
    adding: '넣는 중…',
    drop: '파일을 여기에 끌어다 놓아 주세요',
    keyboard: '키보드는 Tab으로 와서 Enter를 눌러 주세요',
    pick: '파일 고르기',
    urlLabel: '웹 페이지 주소',
    urlPlaceholder: '웹 페이지 주소 https://…',
    fetching: '가져오는 중…',
    fetch: '가져오기',
    urlHint: '주소를 넣으면 가져오기가 켜져요 — Enter를 눌러도 돼요',
    added: (name: string): string => `자료에 담았어요: ${name}`,
    clearResults: '결과 지우기'
  },
  ingest: {
    succeeded: '위키 초안을 마쳤어요. 승인에서 페이지를 읽고 위키에 넣어 주세요',
    syncNeeded: (reason: string): string =>
      `${reason} 팀 것이 안 받아졌을 수 있어요. 동기화 없이 시작하면 옛 보관함 위에 쓸 수 있어요.`,
    startFailed: '위키 초안 만들기를 시작하지 못했어요',
    running: (elapsed: string): string => `위키 초안 만드는 중 · ${elapsed} 지남`,
    cancelFailed: '멈추기를 보내지 못했어요',
    canceling: '멈추는 중…',
    cancel: '멈추기',
    pressAgain: ' — 다시 눌러 주세요',
    toReview: '승인으로',
    withoutSync: '동기화 없이 시작',
    retrySync: '다시 받기',
    retry: '다시 시도',
    explain: (n: number | null): string =>
      `${n === null ? '넣어 둔 자료를' : `넣어 둔 자료 ${n}개를`} AI가 읽고 위키 페이지 초안을 써요. 몇 분 걸리고 구독 사용량을 써요. 초안은 승인에서 고른 것만 위키에 들어가요.`,
    start: (n: number | null): string =>
      n === null ? '위키 초안 만들기' : `자료 ${n}개로 위키 초안 만들기`,
    progress: (total: number, done: number, pages: number): string =>
      `자료 ${total}개 중 ${done}개 초안 마침 · 페이지 초안 ${pages}개`,
    waiting: '기다리는 자료',
    raw: '자세히 — 도움을 청할 때 보여주세요',
    emptyTitle: '초안으로 만들 자료가 없어요',
    emptyBody:
      '먼저 글·문서·웹 페이지를 넣어 주세요. 채팅에 파일을 끌어다 놓아도 돼요. 넣은 자료를 AI가 읽고 위키 페이지를 만들어요'
  }
}
