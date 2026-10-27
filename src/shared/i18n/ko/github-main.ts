// main GitHub 로그인·팀 저장소·요청·주소 읽기 오류(main github/)
export const githubMain = {
  loginAbove: 'GitHub 로그인이 필요해요. 위의 GitHub 로그인을 먼저 해 주세요',
  offline: 'GitHub에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요',
  denied: '로그인을 승인하지 않았어요. 다시 로그인을 눌러 주세요',
  expired: '시간이 지나 코드가 만료됐어요. 다시 로그인을 눌러 주세요',
  orgBlockedLogin: 'GitHub 조직이 이 로그인을 막아 두었어요. 조직 관리자의 승인이 필요해요',
  slowDown: 'GitHub에서 잠시 기다려 달라고 해요. 잠시 뒤 다시 로그인을 눌러 주세요',
  noCode: 'GitHub에서 로그인 코드를 받지 못했어요. 잠시 뒤 다시 눌러 주세요',
  unreachable: 'GitHub에 연결하지 못했어요. 인터넷 연결을 확인해 주세요',
  startFirst: '먼저 로그인을 시작해 주세요',
  loginUnfinished: (code: string): string => `GitHub 로그인이 끝나지 않았어요 (${code})`,
  needLogin: 'GitHub 로그인이 필요해요. 설정의 팀 저장소에서 로그인해 주세요',
  alreadySent: '이 작업은 이미 팀에 보내져 확인을 기다리고 있어요. 열어 보기로 확인해 주세요',
  orgBlocked: 'GitHub 조직이 이 앱의 접근을 막아 두었어요. 조직 관리자의 승인이 필요해요',
  noPushRight: (status: number): string =>
    `팀 저장소에 보낼 권한이 없어요. 그 저장소에 쓸 수 있는 계정으로 로그인했는지 확인해 주세요 (${status})`,
  repoNotFound: '팀 저장소를 찾지 못했어요. 주소와 접근 권한을 확인해 주세요',
  sendFailed: (status: number): string => `팀에 보내지 못했어요 (${status})`,
  notGithubRepo: '팀 저장소가 GitHub 주소가 아니에요',
  noResult: 'GitHub에서 결과를 받지 못했어요. 저장소에서 직접 확인해 주세요',
  linkNeedLogin:
    '질문의 GitHub 주소를 읽으려면 GitHub 로그인이 필요해요 — 설정의 팀 저장소에서 로그인해 주세요',
  linkLoginAgain:
    'GitHub 로그인이 풀려 주소를 읽지 못했어요 — 설정의 팀 저장소에서 다시 로그인해 주세요',
  linkOrgBlocked:
    'GitHub 조직이 이 앱의 접근을 막아 두어 주소를 읽지 못했어요 — 조직 관리자의 승인이 필요해요',
  linkNotVisible:
    'GitHub 주소를 읽지 못했어요 — 주소가 맞는지, 로그인한 계정이 그 저장소를 볼 수 있는지 확인해 주세요',
  linkBusy: 'GitHub 가 잠시 요청을 받지 않아 주소를 읽지 못했어요 — 잠시 뒤 다시 물어봐 주세요',
  filesUnread:
    'GitHub PR 의 변경 파일 목록은 읽지 못했어요 — 제목과 본문만 보고 답해요. 잠시 뒤 다시 물어봐 주세요',
  linksUnread: '질문의 주소를 읽지 못해 그 내용 없이 답했어요 — 잠시 뒤 다시 물어봐 주세요',
  tooManyLinks: (n: number): string =>
    `GitHub 주소는 한 번에 ${n}개까지 읽어요 — 나머지는 따로 물어봐 주세요`,
  linkFailed: (status: number): string =>
    `GitHub 주소를 읽지 못했어요 (${status}) — 잠시 뒤 다시 물어봐 주세요`,
  reloginOrgs:
    '조직을 보려면 GitHub에 다시 로그인해야 해요. 로그아웃한 뒤 다시 로그인해 주세요. 내 계정에는 지금도 만들 수 있어요',
  signedOut: 'GitHub 로그인이 풀렸어요. 위에서 로그아웃한 뒤 다시 로그인해 주세요',
  repoExists: '같은 이름의 저장소가 이미 있어요. 다른 이름을 넣어 주세요',
  orgsFailed: '조직 목록을 읽지 못했어요. 잠시 뒤 다시 읽어 주세요',
  badRepoName: '저장소 이름은 영문·숫자·점·밑줄·하이픈으로 100자까지 쓸 수 있어요',
  noOrg: '조직 이름을 알 수 없어요. 목록에서 다시 골라 주세요',
  noRepoUrl: 'GitHub에서 만든 저장소 주소를 받지 못했어요. GitHub에서 확인해 주세요',
  orgBlocksApp: (org: string): string =>
    `${org} 조직이 이 앱의 접근을 막아 두었어요. 조직 관리자가 GitHub 조직 설정에서 이 앱을 허용해야 만들 수 있어요`,
  orgNoRight: (org: string): string =>
    `${org} 조직에 저장소를 만들 권한이 없어요. 조직 관리자에게 권한을 받거나 내 계정에 만들어 주세요`,
  createFailed: (status: number): string =>
    `저장소를 만들지 못했어요 (${status}). 잠시 뒤 다시 만들어 주세요`,
  badUsername: 'GitHub 아이디는 영문·숫자·하이픈으로 써요. @ 없이 넣어 주세요',
  noSuchUser: (name: string): string =>
    `그런 GitHub 아이디가 없어요 (${name}). 철자를 확인해 주세요`,
  userCheckFailed: (status: number): string =>
    `아이디를 확인하지 못했어요 (${status}). 잠시 뒤 다시 초대해 주세요`,
  noInviteRight:
    '팀원을 초대할 권한이 없어요. 팀 저장소를 만든 계정으로 로그인했는지 확인해 주세요',
  inviteFailed: (status: number): string =>
    `초대하지 못했어요 (${status}). 잠시 뒤 다시 초대해 주세요`,
  joinableFailed: '들어갈 수 있는 보관함을 읽지 못했어요. 잠시 뒤 다시 읽어 주세요',
  vaultCheckFailed: '보관함인지 확인하지 못했어요. 인터넷 연결을 확인하고 잠시 뒤 다시 읽어 주세요',
  unknownInvite: '초대를 알 수 없어요. 목록을 다시 읽어 주세요',
  acceptFailed: (status: number): string =>
    `초대를 수락하지 못했어요 (${status}). 잠시 뒤 다시 해 주세요`,
  noOwner: '저장소를 만들 곳을 알 수 없어요. GitHub에 다시 로그인해 주세요',
  templateHidden: '보관함 원본을 볼 수 없어요',
  starterFailed: (status: number): string =>
    `GitHub에 저장소를 만들지 못했어요 (${status}). 잠시 뒤 다시 하거나 나중에 하기를 눌러 주세요`,
  starterTaken: (name: string, n: number): string =>
    `내 GitHub에 ${name} 이름의 저장소가 이미 ${n}개 있어요. 하나를 정리한 뒤 다시 해 주세요`
}
