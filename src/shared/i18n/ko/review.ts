// 승인 화면 — 확인 바·목록 위 줄·결과 카드·검토 항목(renderer pages/ReviewSection.tsx · lib/review-text.ts)
export const review = {
  undoWindow: '넣은 뒤 다른 편집·위키 초안 만들기를 하기 전까지는 되돌릴 수 있어요',
  approveUpload:
    '승인하면 그 묶음이 GitHub에 올라가요. 혼자 쓰는 저장소면 바로, 함께 쓰는 저장소면 팀 확인 요청으로 가요.',
  teamReview:
    '내 위키에는 바로 들어가고, 페이지와 넣은 자료는 GitHub에 올라가요. 혼자 쓰는 저장소면 바로 올라가 그 뒤엔 되돌릴 수 없어요. 함께 쓰는 저장소면 팀 확인 요청으로 가고(팀 승인은 GitHub에서), 되돌리면 요청도 닫혀요',
  published: 'GitHub에 올렸어요 · 올린 뒤에는 되돌릴 수 없어요',
  republishing: 'GitHub에 올리는 중…',
  /** main 이 보내는 사유의 머리 — 같은 말을 두 번 하지 않게 떼어 낸다 */
  publishFailedHead: 'GitHub에 올리지 못했어요',
  publishFailed: (reason: string): string =>
    `내 위키에는 들어갔어요. GitHub에는 아직 올리지 못했어요 — ${reason || '다시 올려 주세요'}`,
  readCount: (read: number, total: number): string => `읽어 본 ${read}개 / 전체 ${total}개`,
  status: { added: '새 페이지', modified: '고친 페이지' },
  /** git 상태 글자 → 사용자 말 (R100 같은 이름 바꿈 점수는 첫 글자만 본다) */
  change: {
    A: '새 파일',
    M: '고친 파일',
    D: '지운 파일',
    R: '이름 바꾼 파일',
    C: '복사한 파일'
  } as Record<string, string>,
  verifyFailed: (n: number): string =>
    `위키에 넣지 않았어요. 넣기 전 검사에서 문제가 ${n}개 나왔어요. 고치거나 그 페이지를 빼고 다시 넣어 주세요`,
  mergeFailed: '위키에 넣지 못했어요',
  listFailed: '승인 목록을 읽지 못했어요',
  undoFailed: '되돌리지 못했어요',
  undone:
    '위키에서 되돌렸어요. 남은 페이지를 다시 골라 넣어 주세요. 앞서 되돌린 페이지는 목록에 다시 나오지 않아요',
  title: '승인',
  descRun: (run: string): string => `${run} — 승인한 페이지만 위키에 들어가요`,
  desc: 'AI가 만든 페이지를 읽고 넣을 것만 골라 주세요',
  reload: '새로고침',
  finalize: '위키에 넣기',
  confirmCount: (n: number): string => `${n}개 페이지를 위키에 넣어요`,
  confirmNone: '넣을 페이지가 하나도 없어요. 함께 딸린 파일만 넣어요',
  confirmRejected: (n: number): string => ` · ${n}개는 이번에 넣지 않아요`,
  cancel: '취소',
  merge: '넣기',
  merged: (n: number): string => `${n}개 페이지가 위키에 들어갔어요`,
  mergedRejected: (list: string): string => ` · 이번에 넣지 않은 페이지: ${list}`,
  openGithub: 'GitHub에서 보기',
  teamChecking: '팀 확인 중 ·',
  openTeam: '열어 보기',
  shareFailed: (reason: string): string =>
    `내 위키에는 들어갔어요. 팀에는 아직 보내지 못했어요 — ${reason}`,
  ahead: (n: number): string =>
    `아직 팀에 보내지 않은 작업이 ${n}개 있어요. 다음 승인 때 함께 팀에 보내요`,
  nothingAhead: '팀에 보낼 것이 남아 있지 않아요',
  openWiki: '위키에서 보기',
  republish: '다시 올리기',
  undo: '되돌리기',
  line: (n: number): string => ` ${n}번째 줄`,
  read: '읽기',
  readDone: '읽음',
  readLabel: (title: string): string => `${title} 읽기`,
  rereadLabel: (title: string): string => `${title} 다시 읽기 (읽어 봄)`,
  rejectUndo: '거절 취소',
  rejectPage: '이 페이지 거절',
  approveAll: '전체 승인',
  rejectAll: '전체 거절',
  source: (source: string): string => `출처 ${source}`,
  decisionLabel: (title: string): string => `${title} 넣기 선택`,
  approve: '승인',
  reject: '거절',
  others: (n: number): string => `페이지와 함께 들어가는 파일 ${n}개`,
  emptyTitle: '승인할 페이지가 없어요',
  emptyBody:
    '자료를 넣고 위키 초안을 만들면 AI가 만든 페이지가 여기에 떠요. 읽어 보고 고른 것만 위키에 들어가요',
  loading: '승인할 페이지를 불러오는 중…',
  /** 승인 탭 "검토 항목" — AI 점검 발견·검증 결함(renderer views/review-items-section.tsx) */
  items: {
    source: { 'ai-lint': 'AI 점검', verify: '넣기 전 검사' },
    readFailed: '검토 항목을 읽지 못했어요',
    hiddenFailed: '나중에 보기 목록을 읽지 못했어요. 본 목록은 그대로예요',
    dismissFailed: '항목을 나중으로 미루지 못했어요',
    restoreFailed: '항목을 되돌리지 못했어요',
    empty: '검토 항목 없음',
    title: '검토 항목',
    moved: '나중에 보기로 옮겼어요 — 아래 접힌 목록에서 다시 볼 수 있어요',
    noDoc: '연결된 문서가 없어 여기서 열 수 없어요',
    open: '열기',
    later: '나중에',
    hidden: (n: number): string => `나중에 보기로 한 항목 ${n}개`,
    stale: ' (새로고침 실패)',
    restore: '다시 보기'
  }
}
