// 채팅 노트 쓰기 — 읽기만 하는 이유·변경 카드의 막은 것·되돌리기·고친 곳 검토·바뀐 곳 보기(main/note)
export const noteRun = {
  wikiBusy: '위키 초안 만들기가 끝나면 노트를 쓸 수 있어요 — 이번 답은 읽기만 해요',
  noteBusy: '다른 대화가 노트를 쓰는 중이에요 — 끝나면 노트를 쓸 수 있어요. 이번 답은 읽기만 해요',
  stuck:
    '보관함이 정리 중인 상태라 노트를 쓸 수 없어요 — 설정에서 보관함 상태를 되돌린 뒤 다시 물어봐 주세요. 이번 답은 읽기만 해요',
  noGit: '기록을 남길 수 없는 보관함이라 노트를 쓸 수 없어요 — 이번 답은 읽기만 해요',
  readFailed: '보관함 상태를 읽지 못해 노트를 쓸 수 없어요 — 이번 답은 읽기만 해요',
  saveFailed: '보관함의 편집을 먼저 저장하지 못해 노트를 쓸 수 없어요 — 이번 답은 읽기만 해요',
  readOnly: (reason: string): string => `${reason} — 이번 답은 읽기만 해요`,
  unchecked: '쓴 파일을 확인하지 못했어요 — 보관함에서 직접 확인해 주세요',
  undoGone: '되돌릴 기록이 지워졌어요',
  undoBusy: '위키 초안 만들기나 다른 답이 보관함을 쓰는 중이에요 — 끝난 뒤 다시 눌러 주세요',
  undoPending:
    '승인을 기다리는 위키 초안 만들기가 있어 되돌릴 수 없어요 — 승인을 끝낸 뒤 다시 눌러 주세요',
  undoStuck:
    '보관함이 정리 중인 상태라 되돌릴 수 없어요 — 설정에서 보관함 상태를 되돌린 뒤 다시 눌러 주세요',
  undoFailed: '되돌리지 못했어요 — 잠시 뒤 다시 눌러 주세요',
  undoPartial: '되돌리지 못한 파일이 있어요 — 다시 눌러 주세요',
  reviewDone: '이 파일은 이미 되돌렸거나 그 뒤에 고쳐 두었어요',
  reviewEdited:
    '답이 쓴 뒤에 이 파일을 고쳐서 고친 곳별로 나눌 수 없어요 — "바뀐 곳"으로 보거나 통째로 되돌려 주세요',
  reviewNoBase: '답 전 내용을 찾지 못해 고친 곳별로 나눌 수 없어요',
  reviewMoved: '그 사이 문서가 바뀌었어요 — 고친 곳을 다시 읽었어요',
  /** 변경 카드의 막은 것 한 줄 — 무엇을 왜 그대로 두거나 되돌렸는지 */
  blocked: {
    newFolder: (rel: string): string => `실행 중에 생긴 폴더라 그대로 두었어요: ${rel}`,
    newFile: (rel: string): string => `실행 중에 생긴 파일이라 그대로 두었어요: ${rel}`,
    failed: (rel: string): string => `되돌리지 못했어요: ${rel}`,
    restored: (rel: string): string => `지우려 한 파일을 되살렸어요: ${rel}`,
    pending: (rel: string): string => `승인을 끝내면 계획을 쓸 수 있어요 — 되돌렸어요: ${rel}`,
    denied: (rel: string): string => `쓸 수 없는 곳이라 되돌렸어요: ${rel}`,
    outside: (path: string): string => `보관함 밖에 쓰려 했어요: ${path}`,
    deniedTry: (rel: string): string => `쓸 수 없는 곳에 쓰려 했어요: ${rel}`,
    notCommitted: '노트는 저장했지만 기록으로 남기지 못했어요 — 다음 받기 때 함께 기록돼요',
    undoNotCommitted: '되돌렸지만 기록으로 남기지 못했어요 — 다음 받기 때 함께 기록돼요'
  },
  changes: {
    notFound: '이 문서를 찾지 못했어요',
    gone: '이 답의 기록이 지워져 바뀐 곳을 보여 드릴 수 없어요',
    failed: '바뀐 곳을 읽지 못했어요',
    tooBig: '고친 곳이 너무 많아 다 보여 드릴 수 없어요',
    noBaseToday: '오늘 아침 이전 기록이 없어요',
    noBaseYesterday: '어제 이전 기록이 없어요'
  }
}
