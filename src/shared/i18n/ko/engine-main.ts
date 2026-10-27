import { josa } from '../../josa'

// main AI 실행·연결 확인·CLI 찾기·위키 초안 계약 확인 — 화면으로 가는 오류(main engine/ · cli/ · verify/)
export const engineMain = {
  lineSkipped: (line: string): string => `AI 출력 한 줄을 읽지 못해 건너뛰었어요: ${line}`,
  notFinished: 'AI가 답을 끝내지 못했어요 — 다시 시도해 주세요',
  ingestRunning: '이 보관함에서 진행 중인 위키 초안 만들기가 있어요',
  timedOut: 'AI 실행이 너무 오래 걸려 멈췄어요. 인터넷 연결을 확인하고 다시 시도해 주세요',
  unknownError: '알 수 없는 오류',
  unreadable: 'AI 답을 읽지 못했어요 — 다시 시도해 주세요',
  loginNeeded: (label: string): string => `${label} 로그인이 필요해요`,
  mcp: {
    urlTimeout: '10초 안에 답이 없어요. 주소를 확인해 주세요',
    unreachable: '주소에 닿지 않아요. 인터넷 연결과 주소를 확인해 주세요',
    spawnFailed: '명령을 실행하지 못했어요. 명령을 확인해 주세요',
    commandTimeout: '10초 안에 답이 없어요. 명령과 인자를 확인해 주세요',
    badReply: '서버가 이상한 답을 보내요',
    exited: '서버가 바로 꺼졌어요',
    noTalk: '서버에 말을 걸지 못했어요'
  },
  draft: {
    nothingQueued: '초안으로 만들 자료가 없어요 — 먼저 위키 초안 대기함에 자료를 넣어 주세요',
    wikiMoved: (branch: string): string =>
      `위키 초안을 만드는 동안 위키(${branch})가 바뀌어 결과를 쓰지 않았어요 — 다시 만들어 주세요`,
    notCollected: 'AI가 위키 초안을 따로 모아 두지 않았어요 — 다시 만들어 주세요',
    noPages: 'AI가 위키 페이지를 하나도 만들지 않았어요 — 진행 기록을 보고 다시 만들어 주세요',
    leftover: (list: string): string =>
      `넣은 자료 중 처리하지 못한 것이 남았어요: ${list} — 다시 만들어 주세요`
  },
  cli: {
    spawnFailed: (label: string, error: string): string =>
      `${josa(label, '을/를')} 실행하지 못했어요 (${error}) — 파일 권한과 경로를 확인해 주세요`,
    notInstalled: (label: string): string =>
      `${josa(label, '이/가')} 이 컴퓨터에 설치돼 있지 않아요 — 시작하기의 설치 안내를 따라 주세요`
  },
  notVaultFolder: (dirs: string): string =>
    `자료 보관함 폴더가 아니에요. VAULT_RULES.md와 ${dirs} 폴더가 있어야 해요`
}
