import { josa } from '../../josa'

// 채팅 칸 — 탭 띠·머리글·지표 줄·승인 카드·변경 카드·고친 곳 검토·대화 목록·입력칸 칩(renderer views/chat)
export const chatView = {
  /** `back` = 그 탭으로 돌아가는 단추 글자(참고한 페이지 머리의 "← 채팅으로") */
  tabs: {
    chat: { label: '채팅', back: '채팅으로' },
    peek: { label: '참고한 페이지', back: '참고한 페이지로' },
    ingest: { label: '위키 초안', back: '위키 초안으로' },
    history: { label: '기록', back: '기록으로' }
  },
  tabsLabel: '채팅 칸',
  dot: { running: '진행 중', answering: '답 오는 중', unseen: '새 답' },
  collapse: '채팅 칸 접기',
  newConversation: '새 대화',
  history: '지난 대화',
  memoryHint: 'AI가 한 번에 기억할 수 있는 양 중 이 대화가 쓴 비율이에요. 차면 압축해 주세요',
  memory: (percent: number): string => `기억 ${percent}%`,
  usageHint: '계정 사용량 — 쓴 비율, 괄호 안은 다시 채워지기까지 남은 시간',
  usageReread: '사용량 다시 보기',
  permission: { fold: '접기', more: '전체 보기', allow: '허용', deny: '거절' },
  hunk: {
    done: '고친 곳을 다 봤어요',
    line: (n: number): string => `${n}번째 줄`,
    keep: '그대로 두기',
    undo: '되돌리기',
    removed: '지운 줄',
    added: '더한 줄',
    readFailed: '고친 곳을 읽지 못했어요',
    undoFailed: '되돌리지 못했어요',
    loading: '고친 곳을 읽는 중…'
  },
  change: {
    label: '이 답이 바꾼 파일',
    created: '만들었어요',
    edited: '고쳤어요',
    state: {
      undone: '되돌렸어요',
      kept: '그 뒤에 고친 내용이 있어서 되돌리지 않았어요'
    },
    reviewClose: '검토 접기',
    review: '검토',
    marks: '바뀐 곳',
    open: '열기',
    interrupted: '지난 답이 중간에 끊겼어요 — 그때까지 쓴 파일이에요',
    undoing: '되돌리는 중…',
    undo: '되돌리기',
    undone: '이 답이 쓴 것을 되돌렸어요',
    nothingUndone: '되돌린 것이 없어요 — 모두 그 뒤에 고쳐졌어요',
    pruned: '되돌릴 기록이 지워졌어요'
  },
  list: {
    title: '대화',
    empty: '아직 대화가 없어요',
    renameLabel: '대화 이름',
    answering: '답하는 중',
    confirmDelete: (title: string): string => `${title} 지우기 확인`,
    delete: '지우기',
    cancelDelete: '지우기 취소',
    cancel: '취소',
    rename: (title: string): string => `${title} 이름 바꾸기`,
    remove: (title: string): string => `${title} 지우기`
  },
  chips: {
    openTitle: (rel: string): string => `보고 있는 문서 ${rel}의 본문을 이 질문에 붙여요`,
    remove: (title: string): string => `${title} 떼기`,
    commands: '스킬',
    mentions: '붙일 문서',
    skillsLoading: '스킬 목록을 불러오는 중…'
  },
  thread: {
    slashWait: (command: string): string =>
      `답이 끝나면 ${josa(command, '을/를')} 보낼 수 있어요 — 입력칸에 남겨 뒀어요`,
    adding: (n: number): string => `${n}개 넣는 중…`,
    fileFailed: (name: string): string => `${josa(name, '을/를')} 넣지 못했어요`,
    added: (n: number): string =>
      `자료에 ${n}개 담았어요 — 아래 위키 초안 만들기 버튼으로 이어져요`,
    fetchingUrl: '주소의 글을 가져오는 중…',
    urlFailed: '그 주소를 넣지 못했어요'
  },
  messages: {
    scroll: '대화 스크롤',
    log: '대화',
    welcome: '오늘 무엇을 할까요?',
    welcomeBody:
      '노트와 계획은 말로 부탁하면 파일로 써 드려요 — 되돌리기는 답 아래 카드에 있어요. 답 아래에는 AI가 읽은 문서를 함께 보여 드려요. 문서를 콕 집어 묻고 싶으면 @ 로 붙여 주세요.',
    edit: '고쳐서 다시 묻기',
    editHint: '입력칸에 올려 고쳐서 다시 물어요',
    copy: '복사',
    regenerateHint: '이 답을 지우고 같은 질문에 새로 답해요',
    regenerate: '다시 답하기',
    save: '답 남기기',
    saved: (label: string): string => `${label}에 남겼어요 · 열기`,
    toBottomUnread: '새 답 보기 — 맨 아래로',
    /** 글 없이 멈춘 답 — 저장 값(STOPPED_MARK)을 화면 언어로 */
    stopped: '(멈춤)',
    toBottom: '맨 아래로'
  },
  images: {
    typeError: '그림은 PNG·JPEG·GIF·WebP 만 붙일 수 있어요',
    sizeError: '그림이 너무 커서 붙이지 못했어요 — 더 작게 잘라 붙여 주세요',
    countError: (max: number): string => `그림은 한 질문에 ${max}장까지 붙일 수 있어요`,
    readError: '그림을 읽지 못했어요 — 다시 붙여 넣어 주세요',
    pasted: (n: number): string => `붙인 그림 ${n}`,
    remove: (n: number): string => `붙인 그림 ${n} 빼기`,
    count: (n: number): string => `그림 ${n}장`,
    zoom: (alt: string): string => `${alt} 크게 보기`,
    close: '닫기'
  },
  composer: {
    compactPreview: (total: number, asked: number, answered: number): string =>
      `지금까지 ${total}개 메시지(질문 ${asked}·답 ${answered})를 요약해 기억해요. 요약하면 앞부분 원문은 AI가 다시 읽을 수 없어요 — 되돌릴 수 없는 이유예요.`,
    closeNotice: '알림 닫기',
    tooLong: '대화가 길어졌어요 — 주제가 바뀌었다면 새 대화를 열어 주세요. 그래야 답이 더 정확해요',
    urlOffer: '붙여 넣은 주소의 글을 자료함에 넣을 수 있어요 — 나중에 위키 초안으로 만들 수 있어요',
    urlClip: '자료로 넣기',
    urlAsk: '그냥 묻기',
    ingest: '위키 초안 만들기',
    retry: '다시 묻기',
    assistCount: (n: number): string => `고를 수 있는 것 ${n}개 — 위아래 화살표로 골라요`,
    placeholderRunning: '답하는 중… Enter를 누르면 멈춰요',
    placeholder: '오늘 노트·자료·질문 — 편하게 적어 주세요 (@ 문서 붙이기, / 명령)',
    input: '질문 입력',
    attach: '자료 넣기',
    attachHint: '글·문서·메모를 자료로 넣어요 — 파일을 입력칸에 끌어다 놓아도 돼요',
    stop: '중지',
    stopHint: '답 멈추기',
    send: '질문',
    sendHint: '보내기 (Enter · 줄 바꿈은 Shift+Enter)',
    compactHint: '대화 압축 — AI가 앞부분을 요약해서 기억해요',
    compact: '압축',
    compactTitle: '대화를 압축할까요?',
    compactDetail:
      'AI가 이 대화의 앞부분을 짧게 요약해 기억해요. 열린 문서나 다른 대화는 건드리지 않아요. 요약 한 번에 구독 사용량이 조금 들고, 되돌릴 수 없어요. 화면에 보이는 대화는 그대로 남아요.',
    keep: '그대로 두기',
    compactConfirm: '압축하기'
  },
  session: {
    listFailed: '대화 목록을 읽지 못했어요',
    compactedBy: (before: number, after: number): string =>
      ` — ${before}%에서 ${josa(`${after}%`, '으로/로')} 줄었어요`,
    compacted: (howMuch: string): string =>
      `대화를 압축했어요${howMuch}. AI는 앞부분을 요약해서 기억하고, 위의 대화는 그대로 남아요`,
    compactedByAi: 'AI가 앞부분을 요약으로 바꿨어요 — 위의 대화는 그대로 남아요',
    answerFailed: '답을 받지 못했어요',
    rereadFailed: '대화를 다시 읽지 못했어요',
    openFailed: '대화를 열지 못했어요',
    compactBusy: '답하는 중이에요. 답이 끝난 뒤 다시 눌러 주세요',
    compactFailed: '대화를 압축하지 못했어요',
    askFailed: '질문을 보내지 못했어요',
    regenerateFailed: '다시 답하게 하지 못했어요',
    stopFailed: '답을 멈추지 못했어요',
    saved: '노트로 남겼어요',
    saveFailed: '답을 남기지 못했어요',
    undoFailed: '되돌리지 못했어요',
    renameFailed: '대화 이름을 바꾸지 못했어요',
    removeFailed: '대화를 지우지 못했어요',
    permissionFailed: '답을 보내지 못했어요'
  }
}
