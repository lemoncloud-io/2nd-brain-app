// 엔진 도구 호출을 읽는 말로(renderer lib/engine-log.ts) — 원문은 툴팁에 남는다
export const engineLog = {
  tool: {
    Read: '읽어요',
    Write: '써요',
    Edit: '고쳐요',
    MultiEdit: '고쳐요',
    NotebookEdit: '고쳐요',
    Glob: '파일을 찾아요',
    Grep: '내용을 찾아요',
    WebSearch: '웹에서 찾아요',
    WebFetch: '웹 페이지를 읽어요'
  } as Record<string, string>,
  unknownTool: 'AI 도구를 써요',
  write: '써요',
  commit: '바꾼 내용을 기록해요',
  verify: '보관함 규칙을 점검해요',
  patch: '파일을 써요',
  branch: '위키 초안 작업 공간을 따로 만들어요',
  inspect: '바뀐 내용을 확인해요',
  readFile: '파일을 읽어요',
  command: '명령을 실행해요',
  error: '작업 중 문제가 생겼어요',
  canceled: '작업을 취소했어요',
  done: '작업을 마쳤어요',
  failed: '작업을 끝내지 못했어요'
}
