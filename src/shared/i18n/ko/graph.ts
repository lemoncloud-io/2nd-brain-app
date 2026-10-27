// 그래프 화면 — 머리줄·범례·주제 무리·성장 재생 자막·빈 상태(renderer views/graph-*)
export const graph = {
  title: '그래프',
  description: '문서가 어떻게 이어져 있는지 볼 수 있어요',
  failed: '그래프를 그리지 못했어요',
  failedHint: '다시 그려 보고, 계속 안 되면 자료 보관함이 열려 있는지 확인해 주세요',
  redraw: '다시 그리기',
  redrawHint: '위치를 처음부터 다시 잡아요',
  emptyTitle: '아직 그릴 페이지가 없어요',
  emptyHint: '문서가 생기면 서로 어떻게 이어지는지 여기에 그려요',
  loading: '그래프를 그리는 중…',
  pickFromList: '페이지 목록에서 고르기',
  weak: (n: number): string => `서로 거의 안 이어진 주제 무리 ${n}개`,
  kindGroup: '보이는 점 종류',
  /** 종류 버튼 설명 — 이름만으로는 무엇인지 모른다 */
  kindHint: {
    page: '위키 페이지',
    system: 'INDEX 같은, 위키를 굴리는 관리 문서예요',
    ghost: '링크는 있지만 아직 만들지 않은 페이지예요'
  },
  legendLabel: (least: string, most: string, mid: string): string =>
    `이어진 수 ${least}부터 ${most}까지, 중간은 ${mid}. 선이 많이 이어진 페이지일수록 진하게 보여요`,
  legendHint: (mid: string): string =>
    `선이 많이 이어진 페이지일수록 진하게 보여요 · 중간은 ${mid}`,
  legendLinks: '연결',
  legendMid: '· 중간은',
  communityHint: (n: number): string =>
    `서로 잘 이어진 페이지들의 모임만 골라 봐요 · 점이 많은 순 상위 ${n}개`,
  community: '주제 무리',
  communityAll: '전체',
  communityN: (n: number): string => `주제 무리 ${n}`,
  communityWeak: ' (얽힘 약함)',
  fit: '전체 보기',
  fitHint: '그래프 전체가 보이게 맞춰요',
  growth: '성장 재생',
  growthUnready: '점이 다 놓인 뒤에 재생할 수 있어요',
  growthStop: '누르면 멈춰요 (D)',
  growthPlay: '한 페이지에서 전체로 자라는 모습을 보여요 (D)',
  canvas: '위키 페이지 연결 그래프(3D) — 아래 페이지 목록에서 같은 페이지를 열 수 있어요',
  /** 성장 재생 자막 — 원본 updateDemo 의 staged 타이틀 */
  demo: {
    heading: '위키의 성장',
    pages: '개의 페이지',
    tally: (groups: number, born: number, total: number): string =>
      `${groups}개 묶음 · ${born} / ${total} 페이지`,
    progress: '성장 재생 진행률',
    done: '연결된 당신의 뇌 전체.',
    seed: '하나의 생각에서 시작한다.',
    link: '그리고, 연결이 생긴다.',
    branch: '생각이 가지가 된다.',
    compound: '지식이 복리로 쌓인다.',
    shape: '두 번째 뇌가 모습을 갖춘다.'
  }
}
