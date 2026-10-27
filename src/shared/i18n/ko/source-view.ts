// 보관함 파일 보기 — 글·코드 고치기·버전 비교·표·PDF·베이스·웹 페이지 미리보기(renderer views/source-*·sources-*)
export const sourceView = {
  history: '이 파일의 기록 — 옆 칸에서 누가 언제 고쳤는지 봐요',
  edit: '이 파일 고치기',
  saved: '저장했어요',
  previewOf: (name: string): string => `${name} 미리보기`,
  bodyOf: (name: string): string => `${name} 본문`,
  saving: '저장 중…',
  save: '저장',
  discard: '바뀜 버리기',
  discardConfirm: '정말 버리기',
  cancel: '취소',
  dirty: '저장 안 한 바뀜',
  saveKey: '⌘S로 저장',
  comparing: '버전 비교 중 —',
  unsupported: '이 앱에서는 미리 볼 수 없는 형식이에요',
  unsupportedHint: '그림·PDF·워드·파워포인트·글자·표·웹 페이지·소리·영상은 여기서 바로 봐요',
  source: '원문',
  showSource: '원문 보기',
  table: {
    rowsCut: (total: number, shown: number, width: number): string =>
      `${total.toLocaleString()}줄 중 앞 ${shown.toLocaleString()}줄 · ${width}칸`,
    rows: (total: number, width: number): string => `${total.toLocaleString()}줄 · ${width}칸`,
    asTable: '표로 보기'
  },
  pdf: {
    failed: 'PDF를 열지 못했어요',
    pageOf: (rel: string, page: number, total: number): string => `${rel} ${page} / ${total}페이지`,
    pages: (page: number, total: number): string => `${total}페이지 중 ${page}페이지`,
    previous: '이전 페이지',
    next: '다음 페이지'
  },
  base: {
    failed: '이 표를 읽지 못했어요',
    truncated: (total: number, seen: number): string =>
      `보관함 문서 ${total}개 중 앞 ${seen}개만 셌어요`,
    count: (n: number): string => `${n}개`,
    noGroup: '없음',
    empty: '이 조건에 드는 문서가 없어요'
  },
  markdown: {
    readOnly: '읽기만 할 수 있어요',
    asDoc: '문서로 보기'
  },
  html: {
    note: '페이지만 따로 띄웠어요. 비어 보이면 브라우저에서 열어 주세요',
    openBrowser: '브라우저에서 열기',
    asPage: '페이지로 보기'
  },
  code: {
    notJson: 'JSON 형식이 아니에요. 원문 그대로 보여 드려요',
    tooBig: '큰 파일이에요. 들여쓰기를 다시 매기지 않고 원문 그대로 보여 드려요'
  }
}
