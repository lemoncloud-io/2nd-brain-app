// 설정 → 자료 보관함 — 상태·전환·새 창·상태 되돌리기·읽기 중심 폴더(renderer pages/VaultSection.tsx)
export const vaultSettings = {
  title: '자료 보관함',
  /** 빠진 것은 폴더 이름이 아니라 그 폴더가 담는 것으로 말한다 */
  folder: {
    raw: '원본',
    Clippings: '초안 대기',
    wiki: '위키 폴더',
    'VAULT_RULES.md': '보관함 규칙 파일'
  } as Record<string, string>,
  missingUnknown: '무엇이 빠졌는지 알 수 없어요. 다시 열거나 새로 만들어 주세요',
  missing: (list: string): string => `없는 것: ${list}`,
  namesMore: (shown: string, more: number): string => `${shown} 외 ${more}개`,
  restored: '보관함을 평소 상태로 되돌렸어요',
  carried: (names: string): string => `앱에서 고친 문서는 챙겨 왔어요: ${names}`,
  awaitingBack: (names: string): string => `팀이 받아들이면 다시 보여요: ${names}`,
  statusFailed: '자료 보관함 상태를 읽지 못했어요',
  restoreFailed: '되돌리지 못했어요',
  none: '아직 없어요. 새로 만들어 주세요',
  switch: '다른 보관함 열기',
  newWindow: '새 창으로 열기',
  restore: '보관함 상태 되돌리기',
  switchHint: '다른 보관함 열기 — 진행 중인 위키 초안 만들기·대화를 멈추고 고른 보관함으로 바꿔요',
  newWindowHint: '새 창으로 열기 — 지금 창은 그대로 두고 고른 보관함을 별도 창으로 열어요',
  restoreHint:
    '보관함 상태 되돌리기 — 작업 도중 상태로 남은 보관함을 평소 상태로 되돌려요 · 앱에서 고친 문서는 챙겨 와요 · 잠시 안 보이게 될 문서가 있으면 먼저 묻고, 승인 대기 중인 위키 초안 만들기가 있으면 아무것도 하지 않아요',
  recents: '최근 보관함',
  generic:
    '이 폴더는 읽기 중심으로 열려 있어요. 트리와 리더로 읽을 수 있고, 위키 초안 만들기·점검·팀 동기화는 쓸 수 없어요.',
  adoptGeneric: '이 폴더를 보관함으로 쓰기',
  confirm:
    '팀이 아직 확인 중인 문서가 있어요. 되돌리면 팀이 받아들일 때까지 앱에서 보이지 않아요. 지워지지는 않아요.',
  awaiting: (names: string): string => `잠시 안 보이는 문서: ${names}`,
  carry: (names: string): string => `앱에서 고친 문서는 챙겨 와요: ${names}`,
  restoreAnyway: '그래도 되돌리기',
  keep: '그대로 두기',
  invalid: '이 폴더에 위키에 필요한 것이 없어요',
  reopen: '다시 열기'
}
