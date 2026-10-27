// main 승인 오류(main ipc/review-handlers · review/)
export const reviewMain = {
  badRejects: '거절 목록 형식이 잘못됐어요',
  badBranch: '브랜치 형식이 잘못됐어요',
  gitFailure: (what: string, detail: string): string =>
    `${what} — 보관함 기록을 바꾸다 멈췄어요. 다시 해 보고, 계속되면 이 문구를 복사해 알려 주세요 (${detail})`,
  nothingToApprove: '승인할 위키 초안이 없어요. 위키 초안을 마치면 여기에 페이지가 떠요',
  rawChanged: (list: string): string =>
    `원본 파일이 바뀌거나 지워져서 위키에 넣지 않았어요. 원본은 더하기만 할 수 있어요: ${list}`,
  unknownReject: (list: string): string =>
    `승인 목록에 없는 페이지를 거절하려 했어요: ${list} — 새로고침한 뒤 다시 골라 주세요`,
  applyFailed: '위키에 넣지 못했어요',
  notDraft: '되돌릴 위키 초안이 아니에요',
  noDraftToUndo: '되돌릴 위키 초안이 없어요. 이미 되돌렸거나 다른 위키 초안 만들기가 시작됐어요',
  undoMoved:
    '위키에 넣은 뒤 위키가 또 바뀌어서 되돌릴 수 없어요. 그 뒤에 편집이나 다른 위키 초안 만들기가 있었어요',
  unsavedVault: '저장하지 않은 변경이 보관함에 있어서 되돌릴 수 없어요',
  undoPushed: '이미 GitHub에 올라간 위키 초안이라 되돌릴 수 없어요',
  unapplyFailed: '도로 빼지 못했어요',
  draftPrUnknown:
    '팀이 확인 중인 위키 초안 요청이 아직 열려 있는지 알 수 없어요. 잠시 뒤 다시 눌러 주세요',
  editPrUnknown: '열어 둔 팀 확인 요청이 아직 열려 있는지 알 수 없어요. 잠시 뒤 다시 눌러 주세요'
}
