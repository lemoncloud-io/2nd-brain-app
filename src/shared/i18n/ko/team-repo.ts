// 팀 저장소 칸 — 만들기·연결·지금 올리기·연결 끊기·팀원 초대(renderer components/start/team-repo.tsx)
export const teamRepo = {
  orgsFailed: '조직 목록을 읽지 못했어요',
  createUnfinished:
    '팀 저장소 만들기가 끝나지 않았어요. GitHub에서 저장소가 생겼는지 확인해 주세요',
  createTitle: '팀 저장소 만들기',
  createIntro:
    '보관함을 둘 비공개 저장소를 GitHub에 만들고 바로 올려요. 혼자 써도 돼요 — 팀원은 나중에 초대할 수 있어요.',
  owner: '만들 곳',
  myAccount: (login: string | null): string => `내 계정${login ? ` (${login})` : ''}`,
  org: (org: string): string => `${org} 조직`,
  repoName: '저장소 이름',
  createAndUpload: '만들고 올리기',
  signInFirst: '먼저 위에서 GitHub에 로그인해 주세요. 계정이 없으면',
  signUp: '먼저 만들어 주세요',
  signUpFree: '— 무료예요',
  reload: '다시 읽기',
  creating: '만들고 올리는 중…',
  orgSettings: 'GitHub 조직 설정 열기',
  inviteFailed: '초대하지 못했어요',
  inviteTitle: '팀원 초대',
  inviteIntro:
    '팀원의 GitHub 아이디를 넣으면 이 저장소에 초대해요. 팀원은 앱의 ‘팀 보관함에 들어가기’에서 초대를 수락하고 받아요.',
  invitePlaceholder: 'GitHub 아이디',
  invite: '초대',
  invited: (who: string): string =>
    `${who} — 초대를 보냈어요. 앱의 팀 보관함에 들어가기에서 수락하면 들어와요`,
  alreadyMember: (who: string): string => `${who} — 이미 이 저장소에 들어와 있어요`,
  disconnectFailed: 'GitHub 연결을 끊지 못했어요',
  pushFailed: 'GitHub에 올리지 못했어요',
  pushing: '올리는 중…',
  pushed: 'GitHub에 올렸어요',
  connected: '연결됨 ·',
  publicWarning:
    '이 저장소는 로그인하지 않아도 누구나 볼 수 있어요. 올린 위키와 원본 자료가 공개돼요. GitHub에서 저장소를 비공개로 바꾸거나, 아래에서 다른 저장소로 바꿔 주세요.',
  uploads: (approveUpload: string): string =>
    `올라가는 것: 승인한 위키와 넣어 둔 원본 자료. 승인 전 위키 초안은 올라가지 않아요.${approveUpload} 위키 초안 만들기 없이 고친 문서는 사이드바의 “팀에 확인 요청”으로 보내요.`,
  pushWarning:
    '이 버튼은 팀 확인을 건너뛰고 내 보관함을 그대로 올려요. 팀과 함께 쓰는 보관함이면 승인 화면에서 보내 주세요. 그쪽은 팀이 확인한 뒤에 들어가요.',
  pushNow: '지금 올리기',
  change: '다른 저장소로 바꾸기',
  disconnect: '연결 끊기',
  disconnectTitle: '이 컴퓨터의 연결만 끊을까요?',
  disconnectDetail:
    '앞으로 자동으로 올리지 않아요. 이미 GitHub에 올라간 내용은 그대로 남아요. 지우려면 GitHub에서 저장소를 지워 주세요.',
  keep: '그대로 두기',
  uploadsShort: (approveUpload: string): string =>
    `올라가는 것은 승인한 위키와 넣어 둔 원본 자료예요. ${approveUpload}`,
  pasteOpen: '이미 만든 빈 저장소에 연결하기',
  urlPlaceholder: 'https://github.com/내-계정/2nd-brain',
  urlLabel: 'GitHub 저장소 주소',
  connectAndUpload: '연결하고 올리기',
  urlHint: '비어 있는 비공개 저장소여야 해요. 연결하면 바로 한 번 올려요',
  cancelChange: '그만두고 지금 저장소 쓰기',
  noVault: '자료 보관함을 만든 뒤 연결할 수 있어요'
}
