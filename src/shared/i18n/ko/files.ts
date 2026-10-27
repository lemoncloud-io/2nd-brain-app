import { josa } from '../../josa'

// 사이드바 파일·태그·북마크 칸과 파일 다루기(renderer components/tree·layout/sidebar-panes·store)
export const files = {
  panes: { files: '파일', tags: '태그', bookmarks: '북마크' },
  sort: {
    name: {
      short: '이름순',
      action: '최근 고친 순으로 보기',
      title: '지금은 이름순 · 누르면 최근 고친 순'
    },
    recent: {
      short: '최신순',
      action: '이름순으로 보기',
      title: '지금은 최근 고친 순 · 누르면 이름순'
    }
  },
  createFolderFailed: '폴더를 만들지 못했어요',
  createNoteFailed: '노트를 만들지 못했어요',
  saveFirst: '쓰던 글을 먼저 저장하거나 닫아 주세요',
  /** 새로 만들 때 이름 칸의 첫 값 — 사람이 바로 고친다 */
  newFolderName: '새 폴더',
  untitled: '제목 없음',
  renameFailed: '이름을 바꾸지 못했어요',
  moveFailed: '옮기지 못했어요',
  trashFailed: '휴지통으로 보내지 못했어요',
  newFolderLabel: '새 폴더 이름',
  newNoteLabel: '새 노트 이름',
  newNameLabel: '새 이름',
  tools: '파일 도구',
  newNote: '새 노트',
  newNoteHint: '새 노트 — 이름에 .html처럼 형식을 붙이면 그 형식으로 만들어요',
  newFolder: '새 폴더',
  collapseAll: '모두 접기',
  empty: '보관함이 비어 있어요. 새 노트로 시작해 주세요',
  treeLabel: '보관함 파일',
  rename: '이름 바꾸기',
  openRight: '오른쪽에 열기',
  newNoteHere: '이 폴더에 새 노트',
  trash: '휴지통으로 보내기',
  trashTitle: (title: string): string => `${josa(`"${title}"`, '을/를')} 휴지통으로 보낼까요?`,
  trashFolder: '폴더 안의 문서도 함께 옮겨져요. ',
  trashDetail:
    '휴지통에서 되살릴 수 있어요. 이 문서를 가리키던 링크는 이어진 곳이 없는 링크가 돼요.',
  keep: '그대로 두기',
  trashConfirm: '휴지통으로',
  tasks: (done: number, total: number): string => `할 일 ${done}/${total}`,
  tagsFailed: '태그를 읽지 못했어요',
  tagFilter: '태그 거르기',
  tagsEmpty: '아직 태그가 없어요. 문서에 #태그를 쓰거나 속성의 태그 칸에 적어 주세요',
  tagsNoMatch: '맞는 태그가 없어요',
  tagFind: (tag: string): string => `${josa(`#${tag}`, '으로/로')} 찾기`,
  bookmarksEmpty: '북마크한 문서가 없어요. 문서 위의 ☆를 누르면 여기에 모여요',
  unbookmark: (label: string): string => `${label} 북마크 떼기`,
  bookmarkFailed: '북마크를 바꾸지 못했어요',
  treeFailed: '보관함 파일 목록을 읽지 못했어요',
  docsFailed: '보관함 문서 목록을 읽지 못했어요',
  pagesFailed: '위키 페이지 목록을 읽지 못했어요',
  waitingLabel: '위키 초안을 기다리는 자료',
  waitingOpen: (rel: string): string => `${rel} — 눌러서 읽어 볼 수 있어요`,
  waitingRemove: (name: string): string => `${name} 빼기`,
  waitingRemoveHint: '초안으로 만들지 않을 자료를 휴지통으로 보내요'
}
