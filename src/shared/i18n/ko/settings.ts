import { josa } from '../../josa'

// 설정 화면 — 머리·AI 설정·채팅 기본값·고급(모델 직접 입력·위키 초안 모델·MCP·참고 분량·고급 표시·문제 해결)·업데이트
// (renderer views/settings-view.tsx 와 그 아래 *-section·*-field)
export const settings = {
  title: '설정',
  description: 'AI 연결부터 보관함·팀 저장소·화면·업데이트까지 앱 설정을 바꿀 수 있어요',
  reopenStart: '처음 안내(시작하기) 다시 보기',
  aiConnect: 'AI 연결',
  aiConnectLead: '로그인·연결 끊기는 여기에서, 쓸 AI·모델 고르기는',
  aiConnectLink: '아래 AI 설정에서',
  aiConnectTail: ' 해요.',
  teamRepo: '팀 저장소',
  saved: '저장됨',
  save: '저장',
  aiReadFailed: 'AI 설정을 읽지 못했어요',
  aiSaveFailed: 'AI 설정을 저장하지 못했어요',
  ai: {
    title: 'AI 설정',
    pick: '쓸 AI',
    help: {
      claude: 'Claude 구독으로 써요. 로그인과 연결 끊기는 위의 AI 연결에서 할 수 있어요.',
      codex:
        'ChatGPT 구독으로 써요. 로그인과 연결 끊기는 위의 AI 연결에서 할 수 있어요. 위키 초안 품질은 Claude 쪽으로 확인했어요. 어느 쪽이 좋을지 모르겠으면 Claude를 골라 주세요.'
    },
    saveNote: '고르면 바로 저장되고 다음 실행부터 써요. 엔진을 바꾸면 모델은 기본 모델로 돌아가요.',
    model: '모델',
    defaultModel: '기본 모델 (추천)',
    customModel: (name: string): string => `${name} (고급에서 넣은 이름)`,
    codexDefault: 'Codex 기본 모델을 써요',
    modelNote:
      '채팅·위키 초안 만들기·AI 점검이 모두 이 모델을 써요. 위키 초안만 빠른 모델로 따로 두려면 설정 맨 아래 고급에서 정할 수 있어요. 목록에 없는 이름도 고급에서 넣을 수 있어요.'
  },
  chat: {
    title: '채팅',
    readFailed: '채팅 기본값을 읽지 못했어요',
    saveFailed: '채팅 기본값을 저장하지 못했어요',
    modeGroup: 'AI가 도구를 쓸 때'
  },
  claudeUser: {
    title: '내 Claude 설정',
    readFailed: '이 설정을 읽지 못했어요',
    saveFailed: '이 설정을 저장하지 못했어요',
    label: '채팅에도 같이 쓰기',
    hint: '이 컴퓨터에서 Claude를 직접 쓸 때 정해 둔 규칙·말투·명령을 채팅에도 써요. 끄면 이 보관함에 둔 설정만 써요. Claude로 답할 때만 해당돼요.'
  },
  advanced: {
    title: '고급',
    hint: '모델 직접 입력·위키 초안 모델·MCP 서버·내 Claude 설정·고급 표시·AI 프로그램 위치·화면 배치 되돌리기·진단 정보',
    troubleshoot: '문제 해결',
    cliPath: 'AI 프로그램 위치',
    cliChecking: '확인 중이에요',
    cliMissing: '찾지 못했어요'
  },
  customModel: {
    title: '모델 직접 입력',
    hint: (engine: string): string =>
      `목록에 없는 모델 이름을 ${engine}에 넣어요. 비워 저장하면 기본 모델로 돌아가요. 이름을 잘못 쓰면 AI 기능이 돌지 않아요.`,
    label: '모델 이름',
    placeholder: '예: claude-opus-5[1m]'
  },
  draftModel: {
    title: '위키 초안 모델',
    hint: (engine: string): string =>
      `위키 초안 만들기에만 ${engine}의 다른 모델을 써요. 비워 저장하면 위의 모델과 같아져요. 이름을 잘못 쓰면 위키 초안이 돌지 않아요.`,
    label: '위키 초안 모델 이름',
    placeholder: '예: haiku'
  },
  anyAi: 'AI',
  badModelName: '모델 이름에 공백이나 특수문자가 들어갔어요. 이름을 다시 써 주세요',
  budget: {
    title: '채팅이 참고할 문서 양',
    readFailed: '채팅이 참고할 문서 양을 읽지 못했어요',
    saveFailed: '채팅이 참고할 문서 양을 저장하지 못했어요',
    hint: (step: string): string =>
      `${step} 채팅이 보관함을 먼저 검색해 찾은 문서를 질문과 함께 보내요. 다음 질문부터 바뀌어요.`
  },
  display: {
    title: '고급 표시',
    showFileExtensions: {
      label: '파일 형식까지 보이기',
      hint: '트리에서 "메모" 대신 "메모.md"로 보여요. 이름을 바꿀 때 형식도 같이 바꿀 수 있어요.'
    },
    showChatMeters: {
      label: '채팅 모델·AI 기억·사용량 보이기',
      hint: '채팅 입력칸 아래에 지금 쓰는 모델, AI가 이 대화를 얼마나 기억하고 있는지, 계정 사용량이 보여요.'
    }
  },
  panelReset: {
    action: '화면 배치 되돌리기',
    done: '화면 배치를 되돌렸어요. 앱을 다시 열면 기본 배치로 보여요',
    failed: '화면 배치를 되돌리지 못했어요'
  },
  update: {
    title: '앱 업데이트',
    restart: '다시 시작해 새 버전 쓰기'
  },
  mcp: {
    title: 'MCP 서버',
    intro:
      '채팅이 쓸 바깥 도구예요. 미리 정해 둔 일을 대신해 주는 작은 프로그램이라 보면 돼요(다른 앱의 MCP와 같은 방식). 켠 서버만 다음 질문부터 쓰고, 위키 초안 만들기·점검에는 쓰지 않아요. 명령은 이 컴퓨터에서 직접 실행되고, 접속 키 같은 환경 변수는 이 컴퓨터 설정 파일에 그대로 남아요. 믿을 수 있는 서버만 추가해 주세요. 잘 모르면 건너뛰어도 돼요 — 없어도 앱은 그대로 돌아가요.',
    probeOk: '닿았어요. 다음 질문부터 쓸 수 있어요.',
    probeFailed: '연결을 확인하지 못했어요',
    listFailed: 'MCP 서버 목록을 읽지 못했어요',
    saveFailed: 'MCP 서버를 저장하지 못했어요',
    taken: (name: string): string =>
      `${josa(name, '은/는')} 이미 있어요. 다른 이름을 쓰거나 먼저 지워 주세요`,
    enable: (name: string): string => `${name} 켜기`,
    off: '꺼짐',
    envCount: (n: number): string => ` · 환경 변수 ${n}개`,
    probeLabel: (name: string): string => `${name} 연결 확인`,
    probe: '연결 확인',
    removeLabel: (name: string): string => `${name} 지우기`,
    presetHint:
      '서버 문서의 예시를 그대로 넣으면 돼요. 저장한 뒤에는 행의 연결 확인으로 바로 닿는지 볼 수 있어요.',
    presetStdio: '로컬 명령 예시 채우기',
    presetStdioTarget: 'npx -y @modelcontextprotocol/server-filesystem /넣을-폴더',
    presetHttp: '웹 주소 예시 채우기',
    presetHttpTarget: 'https://예시-주소/mcp',
    nameLabel: '서버 이름',
    namePlaceholder: '이름 (예: github)',
    targetLabel: '실행할 명령 또는 주소',
    targetPlaceholder: '명령 (npx -y @modelcontextprotocol/server-github) 또는 https:// 주소',
    add: '추가하기',
    envSummary: '환경 변수(선택) — 서버 문서가 접속 키를 요구할 때',
    envLabel: '환경 변수',
    envPlaceholder: '한 줄에 하나씩 KEY=값\nGITHUB_PERSONAL_ACCESS_TOKEN=...',
    jsonSummary: '설정 JSON 붙여 넣기 — 서버 문서의 "mcpServers" 조각을 그대로',
    jsonLabel: 'MCP 설정 JSON',
    jsonPlaceholder: '{ "mcpServers": { "이름": { "command": "npx", "args": ["-y", "..."] } } }',
    import: '가져오기',
    removeTitle: (name: string): string => `${name} 서버를 지울까요?`,
    removeDetail:
      '목록에서 바로 빠져요. 다시 쓰려면 처음부터 다시 추가해야 해요. 채팅은 다음 질문부터 이 서버를 쓰지 않아요.',
    keep: '그대로 두기',
    remove: '지우기'
  }
}
