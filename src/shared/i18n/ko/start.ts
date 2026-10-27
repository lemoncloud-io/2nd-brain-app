// 시작하기 화면 — 준비 걸음과 처음 3걸음(renderer views/start-view.tsx)
export const start = {
  title: '시작하기',
  backToSettings: '설정으로 돌아가기',
  intro:
    '보관함은 내 문서가 담기는 폴더, AI 연결은 내 AI 구독으로 쓰는 일이에요. 위키 초안 만들기는 AI가 자료를 읽고 위키 초안을 쓰는 일이라서, 구독 사용량이 들어요.',
  doneTitle: '준비를 마쳤어요',
  doneBody:
    '이제 채팅에 말해서 오늘 노트를 쓰고, 그 옆에서 문서를 읽을 수 있어요. 넣어 둔 자료를 위키로 만드는 일은 지식 관리에서 해요.',
  openToday: '오늘 노트 열기',
  stepsLabel: '시작 단계',
  checking: '확인 중…',
  teamRepo: '팀 저장소',
  teamRepoHint: '· 팀원 초대·연결 바꾸기',
  descDone: '준비를 마쳤어요',
  descDoneLater: (later: string): string => `준비를 마쳤어요 · ${later}`,
  descReturning: (later: string): string => `준비 2단계면 시작해요 · ${later}`,
  descSteps: (n: number): string => `${n}단계로 시작해요`,
  purpose: {
    title: '정리하고 싶은 것',
    laterVault: '보관함의 방향 문서에 적어 둘 수 있어요',
    skipped: '나중에 적기로 했어요'
  },
  engine: {
    title: (name: string): string => `${name} 연결`,
    later: 'AI가 자료를 읽고 위키를 써요. 내 구독 계정으로 연결해 주세요',
    connected: (name: string): string => `${name} 연결됨`
  },
  github: {
    title: 'GitHub 연결',
    later: '내 GitHub 계정으로 로그인해요',
    connected: 'GitHub 연결됨',
    deferred: '나중에 하기로 했어요',
    notYet: 'GitHub에는 아직 올리지 않았어요'
  },
  vault: {
    title: '자료 보관함 만들기',
    later: '위키와 자료를 담을 폴더를 만들어요',
    ready: '보관함 준비됨'
  },
  publish: {
    title: 'GitHub에 올리기',
    later: '선택 · 승인한 위키와 넣은 자료를 내 GitHub에 올려 둬요'
  },
  first: {
    label: '처음 3걸음',
    heading: '처음 3걸음이면 내 위키가 생겨요',
    headingHint: '· 10분이면 충분해요',
    intro:
      '하나씩 눌러 따라오세요. 매일 쓰는 일은 아니라서, 이 걸음을 건너뛰고 오늘 노트만 써도 돼요.',
    complete: '첫 위키를 마쳤어요. 이제 매일은 오늘 노트와 채팅으로 지내세요.',
    toToday: '오늘 노트로 가기',
    checking: '걸음 확인 중…',
    today: {
      title: '오늘 노트 쓰기',
      later: '하루는 오늘 노트에서 시작해요',
      summary: '오늘 노트 준비됨',
      fromChat: '채팅에서 오늘 노트 만들기',
      fromChatHint: '채팅 입력칸에 문장이 채워져요. 읽어 보고 Enter를 눌러 주세요'
    },
    clip: {
      title: '자료 넣고 위키 초안 만들기',
      later: '넣은 자료를 위키 초안으로 바꿔요',
      summary: '위키 초안 마침',
      waiting: (n: number): string => `자료 ${n}개가 기다려요`,
      ingest: '위키 초안 만들기',
      ingestHint: '몇 분 걸리고 구독 사용량을 써요',
      add: '자료 넣기',
      addHint: '파일이나 웹 주소를 넣어 주세요. 손에 쥔 게 없으면 예시 글로 시작해 보세요'
    },
    approve: {
      title: '승인해서 위키에 넣기',
      later: '고른 초안만 위키에 들어가요',
      summary: '첫 위키 완성',
      open: '승인할 페이지 보기'
    }
  }
}
