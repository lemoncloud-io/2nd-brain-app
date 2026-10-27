// 보관함 탐색 문구 — 종류로 찾기·트리 배지·폴더 이름·지식 관리 배지·위키 초안 이름·그래프(renderer lib)
export const library = {
  kind: {
    all: '전체',
    doc: '문서',
    pdf: 'PDF',
    image: '그림',
    html: 'HTML',
    other: '그 밖'
  },
  kindGroup: '찾을 종류',
  noKindMatch: '이 종류에서는 찾지 못했어요',
  fileNew: '새 파일',
  fileChanged: '바뀐 파일',
  folderChanged: '안에 달라진 것이 있어요',
  /** 보관함 최상위 폴더 — 저장 위치가 아니라 안에 든 것으로 부른다 */
  root: { raw: '원본', Clippings: '초안 대기', wiki: '위키' } as Record<string, string>,
  badgeApprovals: '승인 대기',
  badgeItems: '검토',
  badgeClippings: '자료',
  runThis: '이번 위키 초안',
  runDate: (month: number, day: number): string => `${month}월 ${day}일 위키 초안`,
  runRepeat: (date: string, repeat: string): string => `${date} (${repeat}번째)`,
  nodePage: '페이지',
  nodeSystem: '보관함 관리 문서',
  nodeGhost: '아직 없는 페이지',
  nodeSystemLabel: (label: string): string => `${label} (보관함 관리 문서)`,
  linksAtMost: (n: number): string => `${n}개 이하`,
  linksAbout: (n: number): string => `${n}개쯤`,
  linksAtLeast: (n: number): string => `${n}개 이상`,
  links: (n: number): string => `${n}개`,
  sampleFailed: '예시 자료를 넣지 못했어요'
}
