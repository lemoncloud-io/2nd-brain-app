import { josa } from '../../josa'

// main 보관함 열기·만들기·팀 저장소 연결 — 대화상자 안내와 오류(main ipc/vault-handlers · vault/)
export const vaultMain = {
  notVault: (missing: string, dir: string): string =>
    `고른 폴더는 자료 보관함이 아니에요. 보관함에 있어야 할 ${josa(missing, '이/가')} 없어요. 새로 시작하려면 보관함 만들기를 눌러 주세요 (${dir})`,
  openUnknown: '알 수 없는 이유로 이 폴더를 열지 못했어요',
  repoNotEmpty:
    '고른 저장소에 이미 내용이 있어요. 비어 있는 새 저장소를 만들어 연결해 주세요(이 앱은 남의 내용 위에 덮어쓰지 않아요)',
  notRepoUrl:
    'GitHub 저장소 주소가 아니에요. https://github.com/계정/저장소 모양으로 붙여 넣어 주세요',
  pickCloneParent: '팀 보관함을 받아 둘 곳을 골라 주세요. 그 안에 저장소 이름으로 폴더가 생겨요',
  pickCreateParent: '자료 보관함을 둘 곳을 골라 주세요. 그 안에 2nd-brain 폴더를 만들어요',
  parentFailed: (dir: string): string => `보관함을 둘 곳을 만들지 못했어요 (${dir})`,
  loginUnchecked:
    'GitHub 로그인을 확인하지 못했어요. 인터넷 연결을 확인하거나 다시 로그인한 뒤 다시 만들어 주세요',
  createFailed: '보관함을 만들지 못했어요. 다시 만들어 주세요',
  pickCreateParentMaybe:
    '자료 보관함을 둘 곳을 골라 주세요. 비어 있지 않으면 그 안에 2nd-brain 폴더를 만들어요',
  noOpenVault: '열린 보관함이 없어요',
  noOwner: '만들 곳을 알 수 없어요. 목록에서 다시 골라 주세요',
  noRepoName: '저장소 이름을 알 수 없어요. 다시 넣어 주세요',
  linkProblem: '연결하는 중에 문제가 생겼어요.',
  createdNotPushed: (reason: string): string =>
    `팀 저장소를 만들고 연결했지만 올리지 못했어요. ${reason} · 지금 올리기로 다시 올려 주세요`,
  createdNotLinked: (reason: string, url: string): string =>
    `팀 저장소는 만들었지만 연결하지 못했어요. ${reason} · 이미 만든 빈 저장소에 연결하기에 ${url} 을 넣어 주세요`,
  linkFirst: '팀 저장소에 먼저 연결해 주세요',
  enterUsername: 'GitHub 아이디를 넣어 주세요',
  adoptable: (notes: number, dir: string): string =>
    `고른 폴더는 아직 2nd-brain 보관함이 아니에요. 노트 ${notes}개가 있어요. 아래 버튼으로 노트는 그대로 두고 보관함으로 쓸 수 있어요 (${dir})`,
  pickNewWindow: '새 창으로 열 보관함을 골라 주세요. 지금 창은 그대로 둡니다',
  newWindowFailed: '새 창을 열지 못했어요. 다시 시도해 주세요',
  noVaultDir: '보관함 폴더를 알 수 없어요. 목록에서 다시 골라 주세요',
  notRecent: '최근 보관함 목록에 없어요. 폴더 열기로 다시 골라 주세요',
  pickAdoptFirst:
    '보관함으로 쓸 폴더를 먼저 골라 주세요. 이미 쓰던 보관함·Obsidian 폴더 열기를 눌러 주세요',
  outsideVault: '자료 보관함 밖 경로예요',
  busyIngest: '위키 초안 만들기가 이미 진행 중이에요',
  busyFinalize: '위키에 넣는 일이 이미 진행 중이에요',
  busyNote: '채팅이 노트를 쓰고 있어요',
  busyVault: '보관함을 쓰는 일이 진행 중이에요',
  busyChat: '이 대화는 이미 답을 받고 있어요',
  busyLint: 'AI 점검이 진행 중이에요',
  clipIngest: '위키 초안 만들기가 진행 중이라 자료를 넣을 수 없어요. 끝난 뒤 다시 넣어 주세요',
  clipFinalize: '승인 처리 중이라 자료를 넣을 수 없어요. 끝난 뒤 다시 넣어 주세요',
  clipNote: '채팅이 노트를 쓰는 중이라 자료를 넣을 수 없어요. 답이 끝난 뒤 다시 넣어 주세요',
  editIngest: '위키 초안 만들기가 진행 중이라 편집을 저장할 수 없어요',
  editFinalize: '위키에 넣는 중이라 편집을 저장할 수 없어요. 끝난 뒤 저장해 주세요',
  editNote: '채팅이 노트를 쓰는 중이라 저장할 수 없어요. 답이 끝난 뒤 저장해 주세요',
  nameRule: '이름에 / \\ : * ? " < > | 나 맨 앞 점은 쓸 수 없어요',
  nameTaken: (name: string): string => `같은 자리에 ${josa(`"${name}"`, '이/가')} 이미 있어요`,
  moveTaken: (name: string): string => `옮길 폴더에 ${josa(`"${name}"`, '이/가')} 이미 있어요`,
  noNoteHere: '그 폴더에는 노트를 만들 수 없어요',
  untitled: '제목 없음',
  noFolderHere: '그 폴더 안에는 폴더를 만들 수 없어요',
  newFolder: '새 폴더',
  entryInvalid: '그 항목은 다룰 수 없어요',
  entryMissing: '그 항목을 찾지 못했어요',
  rawLocked: '원본은 옮기거나 지울 수 없어요. 위키가 출처로 쓰고 있어요',
  topLocked: '보관함의 기본 폴더는 옮기거나 지울 수 없어요',
  rulesLocked: '보관함 규칙 파일은 옮기거나 지울 수 없어요',
  noMoveIntoRaw: '원본에는 옮겨 넣을 수 없어요',
  noMoveThere: '그 폴더로는 옮길 수 없어요',
  noMoveIntoSelf: '폴더를 자기 안으로 옮길 수 없어요',
  emptyFile: '빈 파일이에요',
  attachTooBig: '20MB보다 큰 파일은 붙일 수 없어요',
  baseInvalid: '이 파일은 열 수 없어요',
  baseMissing: '이 파일을 찾지 못했어요',
  bookmarksUnreadable: '북마크 파일(.obsidian/bookmarks.json)을 읽지 못해서 고치지 않았어요',
  noFolder: '폴더가 없어요',
  alreadyVault: '이미 자료 보관함이에요. 그대로 열어 주세요',
  adoptFailed:
    '이 폴더를 보관함으로 만들지 못했어요. 새로 만든 파일은 지웠고 노트는 그대로예요. 다시 시도해 주세요',
  emptyOnly: '빈 폴더만 새 자료 보관함으로 쓸 수 있어요',
  seedFailed: '자료 보관함을 만들지 못했어요. 폴더는 처음처럼 비워 두었어요. 다시 시도해 주세요',
  readOnlyFolder:
    '이 폴더는 읽기 중심으로 열려 있어요. 위키 초안 만들기·점검·팀 동기화는 2nd-brain 보관함에서만 돼요. 그대로 쓰려면 보관함으로 쓰기를 눌러 변환해 주세요',
  noSkeleton: (path: string): string => `뼈대가 없어요: ${path}`,
  noFolderAt: (path: string): string => `폴더가 없어요: ${path}`,
  unknownTemplate: (name: string): string => `모르는 템플릿이에요: ${name}`,
  previewCut: (n: number): string =>
    `${n}번째 슬라이드부터는 길어서 여기 싣지 않았어요 — 기본 앱에서 보세요`,
  templateNoFile: (path: string): string =>
    `뼈대에 파일이 없어서 템플릿을 적용할 수 없어요: ${path}`,
  templateNoPlaceholder: (path: string): string =>
    `뼈대에 토픽 자리표시가 없어서 템플릿을 적용할 수 없어요: ${path}`
}
