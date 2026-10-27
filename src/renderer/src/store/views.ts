// 중앙 자리가 그릴 수 있는 것들 — 탭·기록·사이드바가 같이 쓴다.
// store 안에 따로 둔다: 탭이 뷰 이름을 알아야 하고, workbench 는 탭을 알아야 해서 한 파일에 두면 고리가 된다.

import { getT } from '../lib/i18n'

/**
 * 중앙 자리 — 문서 하나, 웹 페이지 하나, 지식 관리 한 페이지, 설정, 처음 여는 사람의 시작하기.
 * 채팅은 뷰가 아니라 옆 칸이다(`chatOpen`).
 */
export type ViewId = 'start' | 'doc' | 'web' | 'knowledge' | 'settings'

/** 뷰 이름 — 사이드바·탭·리더의 ← 버튼이 같이 쓴다 */
export const viewLabel = (id: ViewId): string => getT().views[id]
