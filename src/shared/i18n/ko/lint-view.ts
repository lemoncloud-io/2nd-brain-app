import { josa } from '../../josa'

// 점검 화면 — 구조 점검·규칙 점검·AI 점검·없는 페이지 링크·두 페이지 합치기(renderer views/lint-view·merge-dialog)
export const lintView = {
  title: '점검',
  description: '위키가 서로 잘 이어져 있는지 확인해요',
  /** 라벨은 그래프 용어가 아니라 사용자가 겪는 일로 쓴다 — orphan·no-outlinks 를 직역하지 않는다 */
  kinds: {
    orphan: {
      label: '어디에서도 안 열리는 페이지',
      hint: '다른 페이지의 링크가 하나도 없어서 찾아 들어가기 어려운 페이지예요'
    },
    'broken-link': {
      label: '눌러도 없는 곳으로 가는 링크',
      hint: '가리키는 페이지가 없어요. 만들거나 고쳐 주세요'
    },
    'no-outlinks': {
      label: '다른 곳으로 안 이어지는 페이지',
      hint: '이 페이지에서 나가는 링크가 하나도 없어요'
    }
  },
  brokenLink: (target: string, line: number): string =>
    `이어진 곳이 없는 링크: ${target} (${line}번째 줄)`,
  failed: '점검하지 못했어요',
  failedHint: '잠시 뒤 다시 점검하거나, 설정에서 자료 보관함이 열려 있는지 확인해 주세요',
  again: '다시 점검',
  checking: '점검하는 중…',
  filterGroup: '종류로 거르기',
  all: '전체',
  kindCount: (label: string, n: number, hint: string): string => `${label} ${n}개 — ${hint}`,
  cleanTitle: '고칠 것이 없어요',
  cleanHint: '페이지들이 서로 잘 이어져 있어요',
  noKindMatch: (label: string): string => `${label} 문제는 없어요 — 다른 종류를 눌러 보세요`,
  verify: {
    head: '보관함 규칙 점검 —',
    pass: '이상 없어요',
    fail: '고칠 것이 있어요',
    unavailable: '확인하지 못했어요',
    cannotRun: '이 보관함에서는 규칙 점검을 돌릴 수 없어요. 위 목록은 그대로 쓸 수 있어요'
  },
  unresolved: {
    title: '아직 없는 페이지로 가는 링크',
    create: '만들기',
    createFailed: '노트를 만들지 못했어요',
    created: (target: string): string => `‘${target}’ 노트를 만들고 열었어요`
  },
  ai: {
    title: 'AI 점검',
    intro:
      '페이지 사이의 모순·오래된 내용·빠진 페이지를 AI가 읽고 찾아요. 몇 분 걸리고 구독 사용량이 들어요.',
    run: 'AI 점검 실행',
    confirm: (n: number): string => `약 ${n}페이지를 점검해요`,
    start: '시작',
    cancel: '취소',
    reading: (n: number, total: number): string => `페이지 ${n}/${total} 읽는 중`,
    running: '점검 중',
    stopping: '멈추는 중…',
    stop: '중지',
    found: (n: number): string => `발견 ${n}개`,
    merge: '두 페이지 합치기',
    clean: '문제가 없어요',
    unparsed: 'AI 답을 읽지 못했어요. 다시 점검하면 대개 해결돼요',
    failed: 'AI 점검을 마치지 못했어요',
    kind: {
      contradiction: '모순',
      outdated: '오래됨',
      'missing-page': '빠진 페이지',
      suggestion: '제안',
      duplicate: '같은 내용'
    },
    severity: { high: '긴급', medium: '보통', low: '낮음' } as Record<string, string>,
    severityDefault: '보통'
  },
  merge: {
    title: '두 페이지 합치기',
    proposing: 'AI가 두 페이지를 합친 글을 쓰고 있어요 ·',
    proposeFailed: '합치기 제안을 만들지 못했어요',
    applyFailed: '합치지 못했어요',
    undoFailed: '되돌리지 못했어요',
    summary: (keep: string, drop: string): string =>
      `${josa(keep, '으로/로')} 합치고 ${josa(drop, '은/는')} 지워요. 그 이름으로 찾아도 ${josa(keep, '이/가')} 열려요.`,
    noEdits: '고칠 링크는 없어요.',
    edits: '링크를 고칠 문서',
    edit: (name: string, count: number): string => `${name}(${count}곳)`,
    moreEdits: (n: number): string => ` 외 ${n}개`,
    body: '합친 글',
    keep: (title: string): string => `남는 페이지 — ${title}`,
    drop: (title: string): string => `지울 페이지 — ${title}`,
    merged: (keep: string, drop: string, edited: number): string =>
      `합쳤어요. 이제 ${josa(drop, '으로/로')} 찾아도 ${josa(keep, '이/가')} 열려요${edited > 0 ? ` · 링크를 고친 문서 ${edited}개` : ''}.`,
    undone: '합치기 전으로 되돌렸어요.',
    dismiss: '그만두기',
    applying: '합치는 중…',
    apply: '합치기',
    undoing: '되돌리는 중…',
    undo: '되돌리기',
    open: '합친 페이지 열기',
    stop: '멈추기',
    close: '닫기'
  }
}
