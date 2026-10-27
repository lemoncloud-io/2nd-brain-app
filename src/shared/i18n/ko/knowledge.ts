// 지식 관리 화면 — 구역 탭과 검색(renderer views/knowledge-view·search-view)
export const knowledge = {
  /** 탭 이름·풀이·수의 뜻 — 짧은 라벨만으로는 자료·점검·승인이 뭐가 다른지 모른다 */
  sections: {
    sources: { label: '자료', describe: '파일과 웹 주소를 넣는 곳', countWord: '기다리는 자료' },
    search: { label: '검색', describe: '문서와 파일을 찾는 곳', countWord: '' },
    graph: { label: '그래프', describe: '이어짐을 입체로 보는 곳', countWord: '' },
    lint: { label: '점검', describe: '이어짐을 확인하고 고치는 곳', countWord: '할 일' },
    review: { label: '승인', describe: '위키에 넣기 전에 확인하는 곳', countWord: '승인 대기' }
  },
  tabCount: (label: string, word: string, n: number): string => `${label} — ${word} ${n}개`,
  backToStart: '처음 3걸음으로',
  search: {
    title: '검색',
    description:
      '들어간 단어나 내용으로 문서를, 이름으로 PDF·그림 같은 파일을 찾아요 — 질문은 채팅에서',
    input: '페이지에 들어간 단어·내용으로 찾아요',
    placeholder: '페이지에 들어간 단어·내용으로 찾아요 — 예: 회의, 이사',
    clear: '검색어 지우기',
    retry: '다시 찾기',
    pending: '찾는 중…',
    hint: '단어나 내용을 적으면 내 문서에서 찾아요 — 이름으로는 파일도 찾아요',
    empty: '내 문서에서 찾지 못했어요',
    askChat: '채팅으로 물어보기'
  }
}
