// 위키 파싱·속성·점검·합치기가 사람에게 내는 이유(shared/wiki)
export const wiki = {
  orphan: '들어오는 링크가 없어요',
  noOutlinks: '나가는 링크가 없어요',
  frontmatterNotMap: '맨 위 속성 블록이 이름: 값 모양이 아니에요',
  badPropertyName: '속성 이름에 : # 줄바꿈은 쓸 수 없어요',
  frontmatterUnreadableFix: '맨 위 속성 블록을 읽지 못했어요. 원문에서 고쳐 주세요',
  frontmatterNotMapFix: '맨 위 속성 블록이 이름: 값 모양이 아니에요. 원문에서 고쳐 주세요',
  mergeAliasFailed: (reason: string): string => `옛 이름을 다른 이름으로 넣지 못했다: ${reason}`,
  changedMidway:
    '보는 사이에 문서가 바뀌어서 바뀐 곳을 표시하지 못했어요. 문서를 다시 열면 다시 표시해요'
}
