// main 이 여러 곳에서 같이 내는 오류 — 잘못된 요청·AI 사용 중(main ipc)
export const mainErrors = {
  badPath: '잘못된 경로예요',
  badName: '잘못된 이름이에요',
  badRequest: '요청을 처리하지 못했어요',
  saveFailed: '저장하지 못했어요',
  engineUnchecked: 'AI 연결을 아직 확인하지 못했어요. 설정에서 확인해 주세요',
  aiWriting: '지금 AI가 보관함을 쓰고 있어요. 끝난 뒤 다시 해 주세요',
  ingestWriting: '위키 초안 만들기가 보관함을 쓰고 있어요. 끝난 뒤 다시 해 주세요',
  pickServerFailed: '서버를 고르지 못했어요',
  serverNotSaved: '저장된 서버가 아니에요. 다시 추가해 주세요',
  thenSave: '저장해 주세요',
  thenMerge: '합쳐 주세요',
  thenUndo: '되돌려 주세요',
  thenSend: '보내 주세요',
  thenDraft: '위키 초안을 만들어 주세요',
  ingestBusyThen: (action: string): string =>
    `위키 초안 만들기가 보관함을 쓰고 있어요. 끝난 뒤 ${action}`,
  noDefaultBranch: '자료 보관함 기록이 온전하지 않아요 — 설정에서 보관함을 다시 열어 주세요',
  draftPending: (action: string): string =>
    `승인을 기다리는 위키 초안 만들기가 있어요 — 승인에서 위키에 넣거나 모두 거절한 뒤 ${action}`,
  teamPending: (action: string): string =>
    `보관함에 팀이 아직 확인 중인 작업이 열려 있어요 — 팀이 받아들이면 앱이 저절로 돌아와요. 기다리지 않으려면 설정에서 "보관함 상태 되돌리기"를 누른 뒤 ${action}`
}
