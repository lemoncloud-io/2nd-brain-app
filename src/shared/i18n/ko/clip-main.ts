// main 자료 넣기·웹 페이지 담기 오류(main ipc/clip·web-handlers · clip/)
export const clipMain = {
  noFilePath: '넣을 파일 경로가 없어요',
  noUrl: '넣을 주소가 없어요',
  pageUnreadable: '이 페이지를 담지 못했어요 — 페이지가 다 뜬 뒤 다시 눌러 주세요',
  pageSaving: '이 페이지를 담는 중이에요',
  oldXls:
    '옛 엑셀 형식(.xls)은 넣을 수 없어요 — 엑셀에서 "다른 이름으로 저장 → .xlsx"로 바꾼 뒤 넣어 주세요',
  oldDoc:
    '옛 워드 형식(.doc)은 넣을 수 없어요 — 워드에서 "다른 이름으로 저장 → .docx"로 바꾼 뒤 넣어 주세요',
  oldPpt:
    '옛 파워포인트 형식(.ppt)은 넣을 수 없어요 — 파워포인트에서 "다른 이름으로 저장 → .pptx"로 바꾼 뒤 넣어 주세요',
  hwpUnreadable: '한글 문서를 열지 못했어요',
  wordUnreadable: '워드 문서를 열지 못했어요',
  pptUnreadable: '파워포인트 파일을 열지 못했어요',
  damaged: (head: string): string => `${head} — 암호가 걸렸거나 손상된 파일이에요`,
  unsupported: (ext: string, list: string): string =>
    `${ext} 파일은 넣을 수 없어요 — ${list}만 넣을 수 있어요`,
  noExtension: '확장자 없는',
  goneAfterDrop: '파일을 열지 못했어요 — 드롭한 뒤 지워졌는지 확인해 주세요',
  tooBig: '파일이 너무 커요 — 200MB까지 넣을 수 있어요',
  fileUnreadable: '파일을 열지 못했어요 — 다시 넣어 주세요',
  pdfUnreadable: 'PDF를 열지 못했어요 — 암호가 걸렸거나 손상된 파일이에요',
  pdfNoText: '이 PDF에서 글자를 찾지 못했어요 — 스캔한 이미지 PDF는 글자로 바꾼 뒤 넣어 주세요',
  docImagesOnly:
    '이 문서에서 글자를 찾지 못했어요 — 그림 위주 문서라 글자가 없어요. 그림 속 글은 옮겨 적어서 넣어 주세요',
  docNoText: '이 문서에서 글자를 찾지 못했어요 — 빈 문서이거나 글자가 그림으로만 들어 있어요',
  xlsxUnreadable: '엑셀 파일을 열지 못했어요 — 암호가 걸렸거나 손상된 파일이에요',
  xlsxEmpty: '이 엑셀에서 글자를 찾지 못했어요 — 모든 시트가 비어 있어요',
  badFileName: '파일 이름을 쓸 수 없어요 — 이름을 바꿔 다시 넣어 주세요',
  badTitle: '파일 이름을 쓸 수 없어요 — 제목을 바꿔 다시 넣어 주세요',
  otherVault:
    '다른 보관함에서 나온 답이라 이 보관함에 저장하지 않아요 — 그 보관함을 연 뒤 저장해 주세요',
  ingestRunning: '위키 초안 만들기가 진행 중이에요 — 끝난 뒤에 저장해 주세요',
  badQuestion: '파일 이름을 쓸 수 없어요 — 질문을 바꿔 다시 남겨 주세요',
  pageTooBig: (size: number): string => `페이지가 ${size}MB보다 커서 넣지 않았어요`,
  notWebAddress: '웹 페이지 주소가 아니에요 — https://로 시작하는 주소를 붙여 넣어 주세요',
  silent: '페이지가 응답하지 않았어요',
  redirects:
    '주소가 다른 곳으로 너무 여러 번 넘어가요 — 브라우저 주소창의 최종 주소를 붙여 넣어 주세요',
  timeout: '30초 안에 응답이 없었어요 — 잠시 뒤 다시 붙여 넣어 주세요',
  unreachable: '페이지에 연결하지 못했어요 — 주소와 인터넷 연결을 확인해 주세요',
  httpFailed: (status: number): string =>
    `페이지를 가져오지 못했어요 (HTTP ${status}) — 주소가 맞는지, 로그인해야 보이는 페이지가 아닌지 확인해 주세요`,
  notText: (type: string): string =>
    `웹 페이지나 글이 아닌 주소예요 (${type}) — PDF는 내려받아 파일로 넣어 주세요`,
  unknownType: '형식 모름',
  zipTooLarge: '풀어 보면 너무 큰 문서라 넣을 수 없어요 — 여러 파일로 나눠서 넣어 주세요',
  hwp3: '한글 3.0 형식은 읽을 수 없어요 — 한글에서 HWPX로 저장한 뒤 넣어 주세요'
}
