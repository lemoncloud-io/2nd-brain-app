// 엔진 CLI 설치 안내(renderer lib/install-guide.ts) — 증상 원문(영어 터미널 문구)은 그 파일에 그대로 둔다
export const install = {
  claudeAccount: 'Claude 구독',
  claudePlan: 'Claude 유료 구독(Pro 이상)',
  codexAccount: 'ChatGPT 구독',
  codexPlan: 'ChatGPT 유료 구독(Plus 이상)',
  paste:
    '아래 한 줄을 복사한 뒤 터미널에 붙여 넣고(맥 ⌘V · 윈도우 Ctrl+V) Enter를 눌러 주세요. 컴퓨터 암호를 물으면 넣고 Enter를 눌러 주세요',
  trust:
    '낯선 주소라 망설여지면: 주소가 화면에 적힌 곳과 같은지, 복사 버튼으로 통째로 들어갔는지 확인해 주세요',
  terminalMac:
    'Spotlight(⌘ 스페이스)를 눌러 "터미널"이라 쓰고 Enter를 눌러 열어 주세요. 검은 화면이 뜨면 된 거예요',
  terminalWindows:
    '시작 메뉴를 열어 "PowerShell"이라 쓰고 Enter를 눌러 열어 주세요. 파란 화면이 뜨면 된 거예요',
  afterInstallSymptom: '설치가 끝났다는데 이 화면이 안 넘어가요',
  afterInstallFix: (engine: string): string =>
    `터미널을 닫고 새로 연 뒤 "${engine} --version"이라 쓰고 Enter를 눌러 주세요. 숫자(예: 2.1.270)가 보이면 아래 "다시 확인"을 누르고, 그래도 안 넘어가면 이 앱을 껐다 켜 주세요`,
  truncatedSymptom: '명령이 길어서 한 줄이 잘려 보여요',
  truncatedFix: '복사 버튼을 쓰면 잘리지 않고 통째로 들어가요. 손으로 옮겨 적지 마세요',
  irmFix:
    '검은 창(명령 프롬프트)이 아니라 파란 창(PowerShell)을 열어야 해요. 시작 메뉴에서 "PowerShell"이라 쓰고 Enter를 눌러 다시 열어 주세요',
  syntaxErrorSymptom: "syntax error near unexpected token '<' 또는 403",
  syntaxErrorFix:
    '설치 파일 대신 오류 페이지를 받았어요. 1~2분 뒤 같은 줄을 다시 실행하거나, 아래 문서의 다른 설치 방법을 써 주세요'
}
