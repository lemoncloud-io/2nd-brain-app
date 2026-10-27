import { josa } from '../../josa'

// 문서 곁 칸 — 백링크·맨 위 속성·버전 비교·기록·목차·참고한 페이지(renderer views/wiki)
export const wikiPanes = {
  backlinks: {
    countFailed: '언급을 세지 못했어요',
    lineMoved: '그 줄이 바뀌어서 이름을 찾지 못했어요',
    linkFailed: '링크를 걸지 못했어요',
    createFailed: '노트를 만들지 못했어요',
    creating: '노트 만드는 중…',
    linking: '링크 거는 중…',
    title: '여기를 가리키는 페이지',
    none: '아직 없어요',
    mentions: '링크 없이 이 이름을 적은 곳',
    linkHint: (term: string): string =>
      `${josa(`"${term}"`, '을/를')} 이 문서로 가는 링크로 바꿔요`,
    link: '링크 걸기',
    unresolved: '이어진 곳이 없는 링크',
    createHint: (target: string): string => `"${target}" 노트를 만들어요`,
    create: '만들기'
  },
  props: {
    /** 페이지 맨 위 속성은 영문 키로 저장된다 — 아는 키만 우리말 이름으로(정본은 VAULT_RULES.md 템플릿) */
    labels: {
      created: '만든 날',
      updated: '고친 날',
      title: '제목',
      tags: '태그',
      source: '출처',
      aliases: '다른 이름',
      status: '상태',
      type: '종류',
      next_action: '다음 할 일'
    } as Record<string, string>,
    value: (label: string): string => `${label} 값`,
    editListHint: '눌러서 고칠 수 있어요 — 여러 값은 쉼표로',
    editHint: '눌러서 고칠 수 있어요',
    empty: '비어 있음',
    remove: (label: string): string => `${label} 지우기`,
    add: '속성 추가',
    newKey: '속성 이름',
    newKeyPlaceholder: '이름 (예: 담당자)',
    newValue: '속성 값',
    newValuePlaceholder: '값',
    unreadable: '이 페이지 맨 위 속성 블록을 읽지 못했어요. 본문은 그대로 읽을 수 있어요',
    rest: (n: number): string => `그 밖의 속성 ${n}개`
  },
  diff: {
    readFailed: '이 버전을 읽지 못했어요',
    restoreFailed: '되돌리지 못했어요',
    same: '지금 글과 같은 버전이에요',
    differs: '이 버전과 지금 글에서 다른 줄이에요',
    restoring: '되돌리는 중…',
    restore: '이 버전으로 되돌리기',
    close: '비교 닫기',
    closeHint: '비교 닫기 — 문서로 돌아가요',
    moved: '보는 사이 문서가 바뀌었어요. 지금 글과 다시 견준 뒤 되돌릴 수 있어요',
    rebase: '다시 견주기',
    tooLarge: '글이 너무 길어서 줄 비교를 보여 주지 못해요',
    before: '예전 글',
    after: '지금 글'
  },
  history: {
    noTextTitle: '기록을 볼 수 없는 파일이에요',
    noDocTitle: '열린 문서가 없어요',
    noTextHint: '글자로 된 파일만 기록을 볼 수 있어요',
    noDocHint: '문서를 열면 그 문서의 기록이 여기 보여요',
    close: '기록 닫기',
    readFailed: '기록을 읽지 못했어요',
    opened: (who: string, when: string): string => `${who} · ${when} 버전을 가운데에 열었어요`,
    hint: '버전을 누르면 지금 글과 비교해요',
    unrecorded: '이 문서는 기록을 남기지 않는 곳에 있어요. 저장해도 버전이 쌓이지 않아요',
    empty: '아직 남은 기록이 없어요. 저장하면 그때부터 기록이 쌓여요',
    labelsPartial:
      '누가 고쳤는지 일부는 가르지 못했어요. AI가 쓴 버전이 사람 이름으로 보일 수 있어요',
    list: '문서 기록',
    truncated: (n: number): string => `최근 ${n}개 버전만 보여요`
  },
  outline: {
    openOnly: '안 끝난 항목만',
    nav: '문서 목차',
    changed: '바뀐 절',
    title: '목차'
  },
  peek: {
    emptyTitle: '아직 고른 페이지가 없어요',
    emptyHint:
      '답 아래 페이지 이름, 검색 결과, 점검·승인 항목, 그래프의 점을 누르면 그 페이지를 여기서 읽을 수 있어요',
    connections: '이어진 페이지',
    fold: '접기',
    more: (n: number): string => `${n}개 더 보기`,
    region: '참고한 페이지',
    regionOf: (title: string): string => `참고한 페이지: ${title}`,
    open: '위키에서 열기',
    close: '참고한 페이지 닫기',
    gone: '지워졌거나 이름이 바뀌었을 수 있어요',
    whole: '답이 이 페이지 전체를 참고했어요'
  }
}
