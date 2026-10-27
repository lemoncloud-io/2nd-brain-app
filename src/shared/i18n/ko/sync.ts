// 팀 변경 받기 상태 한 줄(renderer lib/sync-text.ts) — git 어휘를 쓰지 않는다
export const sync = {
  ahead: (n: number): string => ` · 안 올린 작업 ${n}개`,
  running: '팀 변경을 받는 중…',
  signedOut: (ahead: string): string => `GitHub 다시 연결이 필요해요${ahead}`,
  conflicts: (n: number, ahead: string): string => `나와 팀이 따로 고친 문서 ${n}개${ahead}`,
  behindReviewPending: (n: number, ahead: string): string =>
    `팀에 새 변경 ${n}개 — 승인을 마치면 받아요${ahead}`,
  behind: (n: number, ahead: string): string =>
    `팀에 새 변경 ${n}개 · 받아도 내 작업은 그대로 남아요${ahead}`,
  never: (ahead: string): string => `팀 변경 받기${ahead}`,
  noRemote: '팀 저장소에 연결돼 있지 않아요 — 설정의 팀 저장소에서 연결해 주세요',
  noRemoteHeld:
    '팀 저장소에 연결돼 있지 않아서 지난번 작업에 머물러 있어요 — 설정의 팀 저장소에서 연결해 주세요',
  reviewPending: (ahead: string): string => `지금은 받지 않았어요 — 승인 대기 중이에요${ahead}`,
  busy: (ahead: string): string =>
    `지금은 받지 않았어요 — 위키 초안 만들기나 위키에 넣기가 진행 중이에요 · 끝나면 다시 받을게요${ahead}`,
  stuck:
    '보관함이 작업 도중 상태로 남아 있어서 받지 않았어요 — 설정에서 "보관함 상태 되돌리기"를 누르고, 그래도 남으면 이 보관함을 다루는 동료에게 도움을 청해 주세요',
  switchBlocked:
    '전에 보낸 작업은 팀에 들어갔지만 팀의 최신 내용으로 옮기지 못했어요 — 새로 만든 파일이 팀 문서와 이름이 같은지 보고, 같으면 옮기거나 지운 뒤 다시 받아 주세요',
  held: (ahead: string): string => `팀의 최신 내용은 받아 두었어요${ahead}`,
  receivedMerge: (n: number): string => `팀 변경 ${n}개를 합치기로 받았어요`,
  received: (n: number): string => `팀 변경 ${n}개를 받았어요`,
  nothingNew: '새 팀 변경이 없어요',
  aheadFiles: (shown: string, rest: number): string =>
    `올라가는 파일: ${shown}${rest > 0 ? ` 외 ${rest}개` : ''}`,
  /** 같은 문서를 둘이 고쳤을 때 고르는 칸(renderer views/conflict-picker) */
  conflict: {
    title: '나와 팀이 같은 문서를 따로 고쳤어요',
    explain:
      '— 어느 쪽을 남길지 골라 주세요. 고르지 않은 쪽은 사라지지 않고 같은 폴더에 날짜를 붙여 남아요.',
    more: (n: number): string => ` 고를 문서 ${n}개 중 첫 번째예요.`,
    team: '팀이 고친 내용',
    mine: '내가 고친 내용',
    deleted: '이 문서를 지웠어요. 이 내용을 남기면 문서가 사라져요',
    keep: '이 내용 남기기',
    readFailed: '두 내용을 읽지 못했어요',
    saveFailed: '고른 것을 저장하지 못했어요'
  }
}
