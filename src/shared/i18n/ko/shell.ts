import { josa } from '../../josa'

// 앱 틀 — 사이드바·탭 띠·채팅 칸 토글·준비 가드·팔레트·공용 컴포넌트(renderer App·components·hooks)
export const shell = {
  sidebarCollapse: '사이드바 접기',
  sidebarExpand: '사이드바 펴기',
  sidebarNarrow: '창이 좁아서 접어 두었어요. 채팅 칸을 접으면 다시 보여요',
  sidebarWidth: '사이드바 폭',
  sidebarViews: '사이드바 보기',
  chatCollapse: '채팅 칸 접기',
  chatExpand: '채팅 칸 펴기',
  chatPane: '채팅 칸',
  chatPaneWidth: '채팅 칸 폭',
  sidecar: '옆 칸',
  sidecarOpened: (label: string): string => `옆 칸에 ${josa(label, '을/를')} 열었어요`,
  resizeValue: (label: string, width: number): string => `${label} ${width}픽셀`,
  openTabs: '열린 문서',
  closeTab: (label: string): string => `${label} 탭 닫기`,
  newTab: '새 탭',
  checking: '확인 중…',
  loading: '불러오는 중…',
  reading: '읽는 중…',
  engineMissing: '설치 안 됨',
  engineConnected: (email: string | null): string => `연결됨${email ? ` · ${email}` : ''}`,
  engineLoggedOut: '로그인 안 됨',
  vaultNotChosen: '보관함 고르기 전',
  vaultBroken: (dir: string): string => `${dir} — 필요한 폴더가 없어요`,
  vaultSettings: '자료 보관함 설정 열기',
  change: '바꾸기',
  backToDoc: '문서로 돌아가기',
  knowledgeHint: '자료·검색·그래프·점검·승인 — 매일 쓰지 않는 것',
  appVersion: (version: string): string => `앱 버전: ${version}`,
  syncPick: '승인에서 고르기',
  syncSignIn: '설정에서 로그인',
  syncConnect: '팀 저장소 연결하기',
  syncRetry: '다시 받기',
  syncReceive: '받기',
  recheck: '다시 확인',
  syncPickLabel: '나와 팀이 따로 고친 문서 고르기',
  syncSignInLabel: 'GitHub 다시 연결이 필요해요. 설정에서 로그인',
  syncReceiveLabel: '팀 변경 받기',
  shareFailed: '팀에 보내지 못했어요',
  sharing: '팀에 보내는 중…',
  shareNothing: '아래에서 함께 보낼 새 문서를 골라 주세요',
  shareMore: '새로 고친 것 보내기',
  shareEdits: (n: number): string => `고친 문서 ${n}개 · 팀에 확인 요청 보내기`,
  shareOpenHint: '브라우저의 GitHub 확인 화면으로 열어요',
  shareOpen: '팀 확인 중 · 열어 보기',
  shareHeldReview: '승인 대기 중 — 고친 것은 그 승인과 함께 가요',
  shareHeldPending: '전에 보낸 작업이 팀 확인 중 — 새로 고친 것은 확인이 끝나면 여기서 보내요',
  shareFiles: (list: string): string => `보낼 문서:\n${list}`,
  shareFreshFiles: (list: string): string => `앱 밖에서 새로 만든 문서:\n${list}`,
  shareWithFresh: (n: number): string => `새로 만든 문서 ${n}개도 함께 보내기`,
  restarting: '다시 시작하는 중…',
  restartForUpdate: (version: string): string => `새 버전 ${version} · 다시 시작`,
  gate: {
    vaultNone: ['자료 보관함이 필요해요', '위키와 자료를 담을 보관함을 먼저 만들어 주세요'] as [
      string,
      string
    ],
    vaultInvalid: [
      '자료 보관함을 열 수 없어요',
      '폴더가 옮겨졌거나 필요한 것이 빠졌어요. 설정에서 다시 열어 주세요. 처음부터 다시 만들려면 시작하기의 보관함 만들기로 가세요'
    ] as [string, string],
    engineMissing: (name: string): [string, string] => [
      `${name} 설치가 필요해요`,
      name === 'Claude'
        ? '시작하기에서 한 줄 설치 안내를 따라 주세요'
        : '시작하기에서 설치 안내를 따르거나 Claude로 바꿔 주세요'
    ],
    engineUnreadable: (name: string): [string, string] => [
      `${name}를 다시 설치해 주세요`,
      '설치된 버전이 오래돼서 로그인 상태를 확인할 수 없어요'
    ],
    engineLoggedOut: (name: string): [string, string] => [
      `${name} 로그인이 필요해요`,
      '시작하기에서 브라우저로 로그인해 주세요'
    ],
    slow: '확인이 오래 걸리고 있어요',
    slowDetail:
      '앱이 자료 보관함과 AI 연결을 확인하지 못했어요. 다시 확인하거나 설정에서 자료 보관함을 열어 주세요.',
    toStart: '시작하기로',
    toSettings: '설정으로',
    checking: '자료 보관함과 AI 연결을 확인하는 중… 8초가 지나도 안 끝나면 다시 확인이 떠요'
  },
  setupRead: {
    journey: '진행 상황을 읽지 못했어요',
    remote: '팀 저장소 연결을 읽지 못했어요',
    github: 'GitHub 로그인 상태를 읽지 못했어요',
    vault: '자료 보관함을 확인하지 못했어요',
    engine: 'AI 연결을 확인하지 못했어요',
    sync: '팀 변경 상태를 읽지 못했어요',
    receive: '팀 변경을 받지 못했어요'
  },
  nextStart: '시작하기로',
  nextIngest: '위키 초안 만들기',
  nextAdd: '자료 넣기',
  details: '자세히',
  copied: '복사됨',
  copyFailed: '복사하지 못했어요. 끌어서 선택한 뒤 복사해 주세요',
  clear: '지우기',
  linkOpenFailed: '이 페이지를 열지 못했어요',
  linkExcerpt: '앞부분만 보여 드려요 — 링크를 누르면 전부 열려요',
  mediaUnplayable:
    '이 컴퓨터에서 재생할 수 없는 형식이에요. 아래 버튼을 눌러 다른 앱에서 열어 주세요',
  unsavedTitle: '저장하지 않은 글이 있어요',
  unsavedDetail:
    '버리면 이번에 쓴 글이 사라지고 되돌릴 수 없어요. 남기려면 계속 편집해서 저장하세요',
  keepEditing: '계속 편집',
  discard: '버리기',
  openInObsidian: 'Obsidian에서 열기',
  revealIn: (app: string): string => `${app}에서 보기`,
  fileExplorer: '파일 탐색기',
  fileManager: '파일 관리자',
  palette: {
    title: '문서 찾기와 명령',
    noCommand: '그런 명령이 없어요',
    noDocs: '보관함에 아직 문서가 없어요',
    noRecent: '최근 연 문서가 없어요. 제목이나 내용을 입력해 주세요',
    searchFailed: (error: string): string => `${error} — 제목이 일치하는 문서만 보여요`,
    commandName: '명령 이름',
    inputLabel: '문서 제목이나 내용, > 로 명령',
    inputPlaceholder: '문서 제목이나 내용 — > 로 명령',
    commands: '명령',
    docs: '문서',
    recent: '최근 연 문서',
    body: '본문',
    searchView: (text: string): string => `검색 뷰에서 “${text}” 찾기`,
    openDoc: '열린 문서'
  }
}
