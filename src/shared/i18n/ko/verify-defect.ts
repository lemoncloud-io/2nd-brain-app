// 병합 전 검증 결함마다 무엇을 고칠지(shared/wiki/verify-defect.ts)
export const verifyDefect = {
  tabIndent: '속성 블록 들여쓰기에 탭이 있어요. 공백으로 바꿔 주세요',
  duplicateKey: '속성 블록에 같은 이름이 두 번 있어요. 하나만 남겨 주세요',
  listUnderValue: '값이 있는 속성 아래에 목록이 붙어 있어요. 둘 중 하나만 남겨 주세요',
  frontmatter: '페이지 맨 위 속성 블록을 읽지 못했어요. 형식을 확인해 주세요',
  nextActionJoined: '다음 할 일 한 줄에 여러 개가 붙어 있어요. 한 줄에 하나씩 나눠 주세요',
  nextActionLong: '다음 할 일 한 줄이 너무 길어요. 자세한 내용은 본문으로 옮겨 주세요',
  nextActionShape:
    '다음 할 일을 한 칸에 묶거나 여러 줄로 쓰지 말고, 한 줄 글 하나나 한 줄에 하나씩인 목록으로 써 주세요',
  memoryMissing: '보관함 기억 파일이 없어요. 위키화를 다시 실행해 주세요',
  memoryLong: '보관함 기억 파일이 너무 길어요. 자세한 내용은 실행 기록으로 옮겨 주세요',
  memoryRepeated: '보관함 기억 파일에 같은 줄이 여러 번 있어요. 하나만 남겨 주세요',
  memoryLineLong: '보관함 기억 파일의 한 줄이 너무 길어요. 자세한 내용은 실행 기록으로 옮겨 주세요',
  runLogMissing: '이번 실행 기록이 남지 않았어요. 위키화를 다시 실행해 주세요',
  originalChanged: '원본 파일이 바뀌었어요. 원본은 고칠 수 없으니 그 변경을 되돌려 주세요',
  fallback: '페이지를 열어 문제를 확인해 주세요'
}
