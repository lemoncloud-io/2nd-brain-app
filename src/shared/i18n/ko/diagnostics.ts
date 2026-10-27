// 문제 해결 — 진단 기록(로그)·진단 정보·개발자 모드. 용어 = DESIGN.md § 화면 말
export const diagnostics = {
  uncaughtTitle: '앱에서 예상하지 못한 오류가 났어요',
  // 앱 창 화면이 멈췄다(렌더러 종료) — main 대화상자
  rendererGoneTitle: '화면이 멈췄어요',
  rendererGoneDetail:
    '다시 열면 이어서 쓸 수 있어요. 계속되면 진단 정보를 내보내 앱을 준 팀에 보내 주세요.',
  reopen: '다시 열기',
  openLogs: '진단 기록 폴더 열기',
  closeWindow: '창 닫기',
  // 렌더 중 오류 — 앱 전체 경계의 복구 화면
  crashTitle: '화면을 그리다 문제가 생겼어요',
  crashBody: '다시 열면 풀릴 수 있어요. 계속되면 진단 정보를 내보내 앱을 준 팀에 보내 주세요.',
  openLogsFailed: '진단 기록 폴더를 열지 못했어요',
  // 설정 > 고급 > 문제 해결 — 진단 정보 내보내기
  title: '진단 정보',
  hint: '진단 기록과 앱 정보를 파일 하나로 저장해요. 문제가 생기면 이 파일을 앱을 준 팀에 보내 주세요. 기록에 보관함 글 일부가 들어갈 수 있어요.',
  exportDiagnostics: '진단 정보 내보내기',
  exportTitle: '진단 정보 저장',
  /** 저장 대화상자의 기본 파일 이름 — 사용자에게 보인다 */
  exportFileName: (stamp: string): string => `2nd-brain-진단-${stamp}.zip`,
  exportDone: (name: string): string => `${name} 파일로 저장했어요`,
  exportFailed: '진단 정보를 내보내지 못했어요',
  // 개발자 모드 — 문제를 찾는 사람(앱을 준 팀)이 쓰는 손잡이
  developerMode: '개발자 모드',
  developerModeHint:
    '기록을 자세히 남기고 개발자 도구·프로세스 사용량·성능 기록을 쓸 수 있어요. 문제를 찾을 때만 켜 주세요.',
  developerModeFailed: '개발자 모드를 바꾸지 못했어요',
  openDevTools: '개발자 도구 열기',
  devToolsFailed: '개발자 도구를 열지 못했어요',
  processes: '프로세스',
  refresh: '새로 고침',
  metricsFailed: '프로세스 사용량을 읽지 못했어요',
  colType: '종류',
  colName: '이름',
  colCpu: 'CPU',
  colMemory: '메모리',
  memoryMB: (mb: number): string => `${mb}MB`,
  traceStart: '성능 기록 시작',
  traceStop: '성능 기록 멈추기',
  traceRecording: (elapsed: string): string => `기록 중 · ${elapsed}`,
  traceHint:
    '느린 동작을 한 번 해 본 뒤 멈추세요. 5분이 지나면 저절로 멈춰요. 기록은 진단 기록 폴더에 최근 3개까지 남고, 진단 정보에는 들어가지 않아요 — 연 웹 페이지 주소가 들어 있을 수 있어 보낼 때는 직접 골라 주세요.',
  traceFailed: '성능 기록을 하지 못했어요',
  // 켜기 전 main 대화상자 — 남이 시킨 코드를 개발자 도구에 붙여 넣는 사기를 막는다
  developerModeConfirmTitle: '개발자 모드를 켤까요?',
  developerModeConfirmDetail:
    '앱을 준 팀이 문제를 찾을 때 쓰는 기능이에요. 누군가 개발자 도구에 무엇을 붙여 넣으라고 하면 따르지 마세요 — 보관함과 계정이 넘어갈 수 있어요.',
  developerModeConfirm: '켜기',
  cancel: '취소',
  stateFailed: '개발자 모드 상태를 읽지 못했어요'
}
