import { josa } from '../../josa'

// AI 연결 칸 — 설치·로그인·연결 끊기·AI 바꾸기(renderer components/start/engine-connect.tsx). 시작하기와 설정이 같이 쓴다
export const engineConnect = {
  installTimeout: (name: string): string =>
    `10분이 지나도 ${name} 설치가 끝나지 않았어요. 인터넷 연결을 확인하고 다시 시도해 주세요`,
  installNotFound: (name: string): string =>
    `설치는 끝났는데 ${josa(name, '을/를')} 찾지 못했어요. 앱을 껐다 켠 뒤에도 그대로면 아래 "직접 설치"를 따라 주세요`,
  installFailed: (name: string): string =>
    `${name} 설치를 끝내지 못했어요. 다시 시도하거나 아래 "직접 설치"를 따라 주세요`,
  installStartFailed: '설치를 시작하지 못했어요',
  loginOpenFailed: '로그인 창을 열지 못했어요',
  stillLoggedIn: (name: string): string =>
    `${josa(name, '이/가')} 아직 로그인 상태로 보여요. 잠시 뒤 다시 누르거나 앱을 껐다 켜 주세요`,
  logoutFailed: '연결을 끊지 못했어요',
  switchFailed: '연결할 AI를 바꾸지 못했어요',
  switchTo: (account: string, name: string): string => `${account}을 쓴다면 ${name}로 연결하기`,
  joinPrefix: '구독이 없으면 먼저 만들어 주세요 —',
  join: (plan: string): string => `${plan} 가입하기`,
  checking: (name: string): string => `${name} 확인 중…`,
  connected: (name: string): string => `${name} 연결됨`,
  viaLogin: (via: string): string => `${josa(via, '으로/로')} 로그인`,
  version: (version: string): string => ` · 버전 ${version}`,
  limitPrefix: '지금은 사용량 한도에 걸려 있어요 —',
  limitSoon: '잠시 뒤 다시 쓸 수 있어요',
  limitAt: (at: number): string => `${new Date(at).getHours()}시쯤 다시 쓸 수 있어요`,
  limitSuffix: '. 연결은 그대로예요.',
  accountUnknown: (account: string): string =>
    `어느 계정으로 로그인했는지는 ${account} 웹에서 확인해 주세요`,
  logout: '연결 끊기',
  logoutTitle: '이 컴퓨터에서 연결을 끊을까요?',
  logoutDetail: (account: string | null, name: string): string =>
    `${account ? `${account} 계정의 ` : ''}${name} 연결이 끊겨요. 위키와 넣어 둔 자료는 그대로 남고, 다시 로그인하면 이어서 쓸 수 있어요.`,
  keep: '그대로 두기',
  missingIntro: (name: string, account: string): string =>
    `${name} 프로그램을 이 컴퓨터에 한 번 설치해요. ${account} 본인 계정으로 써요 — 유료 구독이 있어야 하고, 이 앱에 따로 결제하지는 않아요. 터미널을 열 필요는 없어요.`,
  installing: '설치하는 중…',
  retry: '다시 시도',
  install: (name: string): string => `${name} 설치`,
  installDownloading: '설치 파일을 받는 중… 몇 분 걸릴 수 있어요',
  installStalled: (name: string): string =>
    `아직 ${josa(name, '이/가')} 보이지 않아요. 아래에서 터미널에 뜬 문구를 찾아봐 주세요.`,
  manual: '잘 안 되면 — 직접 설치 (최후 수단)',
  manualDone: '설치가 끝나면 이 화면이 알아서 다음으로 넘어가요(최대 10분 안에 확인해요)',
  manualHints: (retry: boolean): string =>
    `먼저 위의 ${retry ? '다시 시도' : '설치'} 단추를 눌러 보세요. 그래도 안 되면 아래 터미널 문구를 찾아봐 주세요`,
  recheck: '다시 확인',
  docs: '설치 안내 문서',
  unreadable: (name: string): string =>
    `이 컴퓨터의 ${josa(name, '이/가')} 로그인 상태를 알려 주지 않아요. 설치된 버전이 오래됐을 수 있어요. 1. 아래 한 줄을 복사해 터미널에 붙여 넣고 Enter를 눌러 다시 설치하고, 2. 앱을 껐다 켜 주세요.`,
  loginIntro: (account: string): string =>
    `${account} 계정으로 로그인해 주세요. 브라우저가 열리면 로그인한 뒤 이 창으로 돌아오면 돼요.`,
  loginReopen: '로그인 창 다시 열기',
  loginBrowser: '브라우저에서 로그인',
  loginStalled: '아직 로그인이 확인되지 않아요. 브라우저 창을 닫았다면 위에서 다시 열어 주세요.',
  loginWaiting: '브라우저에서 로그인을 마치면 여기가 자동으로 바뀌어요'
}
