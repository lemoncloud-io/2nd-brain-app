import type { VaultDocEntry } from './vault'

export const APP_CHANNELS_WIKI = {
  listWikiPages: 'wiki:list-pages',
  listGraphPages: 'wiki:list-graph-pages',
  listVaultDocs: 'vault:list-docs',
  listVaultTree: 'vault:list-tree',
  createVaultNote: 'vault:create-note',
  createVaultFolder: 'vault:create-folder',
  renameVaultEntry: 'vault:rename-entry',
  moveVaultEntry: 'vault:move-entry',
  trashVaultEntry: 'vault:trash-entry',
  readBase: 'vault:read-base',
  readWikiPage: 'wiki:read-page',
  checkboxCounts: 'wiki:checkbox-counts',
  writeWikiPage: 'wiki:write-page',
  writeTextFile: 'vault:write-text',
  docHistory: 'wiki:doc-history',
  docAt: 'wiki:doc-at',
  saveAttachment: 'wiki:save-attachment',
  listTemplates: 'wiki:list-templates',
  listTags: 'wiki:list-tags',
  unlinkedMentions: 'wiki:unlinked-mentions',
  listBookmarks: 'vault:list-bookmarks',
  toggleBookmark: 'vault:toggle-bookmark',
  getEditLock: 'wiki:get-edit-lock',
  wikiChanged: 'wiki:changed'
} as const

/** 파일 트리 한 줄 — 평면 목록으로 오고 중첩은 화면이 만든다. `ext` 는 점 포함 소문자(`.md`), 폴더는 빈 문자열 */
export type VaultTreeEntry = {
  rel: string
  kind: 'dir' | 'file'
  ext: string
  mtimeMs: number
  /** 파일 크기. 폴더는 0 — mtime 만으로는 같은 시각에 바뀐 내용을 못 가른다 */
  size: number
}

export type WikiListEntry = {
  rel: string
  slug: string
  title: string
  frontmatter: Record<string, unknown> | null
  frontmatterError?: string
  links: { target: string; heading?: string; alias?: string; vaultFile?: boolean }[]
  mtimeMs: number
  size: number
}

/**
 * 문서 기록 한 줄의 누가 — ai = AI가 씀(위키화·채팅 노트), me = 내가 고침(GitHub 로그인 기준),
 * person = 다른 사람이 고침(author = 그 사람 이름), app = 로그인 전 앱 이름으로 남은 고침(누군지 모른다)
 */
export type DocVersionKind = 'ai' | 'me' | 'person' | 'app'

export type DocVersion = {
  rev: string
  kind: DocVersionKind
  author: string
  /** ISO 8601 작성 시각 */
  date: string
}

/** 문서 기록 목록 상한 — 넘으면 오래된 버전을 줄이고 `truncated` 로 알린다 */
export const DOC_HISTORY_LIMIT = 200

export type DocHistory = {
  versions: DocVersion[]
  /** false = 기록을 남기지 않는 문서(git 이 무시하는 파일·기록 없는 보관함) — 저장해도 쌓이지 않는다 */
  recorded: boolean
  /** 오래된 버전을 줄였다(`DOC_HISTORY_LIMIT`) */
  truncated: boolean
  /** 누가 썼는지 일부를 가르지 못했다 — AI 가 쓴 버전이 사람 이름으로 보일 수 있다 */
  labelsPartial: boolean
}

export type DocHistoryResult = DocHistory | { error: string }

export type WikiReadResult = {
  page: import('../wiki/parse').WikiPage
  text: string
  /** sha256(text) — 편집 충돌 검사용 */
  hash: string
}

export interface AppApiWiki {
  listWikiPages(): Promise<WikiListEntry[] | { error: string }>
  /** 그래프 입력 — 볼트 전체 md의 rel·slug·frontmatter·links */
  listGraphPages(): Promise<import('../wiki/graph').GraphPageInput[] | { error: string }>
  /** 보관함 문서 목록 — `wiki/` 밖 `projects/`·`outputs/`·`areas/` 까지. 구조 점검은 listWikiPages 를 쓴다 */
  listVaultDocs(): Promise<VaultDocEntry[] | { error: string }>
  /** 파일 트리 — 숨김 폴더 밖의 모든 폴더·파일(평면) */
  listVaultTree(): Promise<VaultTreeEntry[] | { error: string }>
  /** 그 폴더(`''` = 맨 위)에 빈 노트·새 폴더를 만든다 — 만든 경로를 돌려준다 */
  /** `name` 을 주면 그 이름으로, 안 주면 기본 이름에 번호를 붙인다 */
  createVaultNote(folder: string, name?: string): Promise<{ rel: string } | { error: string }>
  createVaultFolder(parent: string, name?: string): Promise<{ rel: string } | { error: string }>
  /** 트리 항목 이름 바꾸기 — 문서는 확장자를 안 쳐도 붙는다. 바뀐 경로를 돌려준다 */
  /** `nameHasExt` = 화면이 확장자까지 보여 주고 받은 이름 — 그때만 확장자가 바뀐다 */
  renameVaultEntry(
    rel: string,
    name: string,
    nameHasExt?: boolean
  ): Promise<{ rel: string } | { error: string }>
  /** 트리 항목을 다른 폴더(`''` = 맨 위)로 옮긴다 */
  moveVaultEntry(rel: string, toFolder: string): Promise<{ rel: string } | { error: string }>
  /** OS 휴지통으로 보낸다 — 휴지통에서 되살릴 수 있다 */
  trashVaultEntry(rel: string): Promise<{ ok: true } | { error: string }>
  /** `.base` 파일을 뷰별 표로 읽는다 — 읽기 전용, 이 앱이 아는 문법만 계산한다 */
  readBase(rel: string): Promise<import('../bases/evaluate').BaseTable>
  readWikiPage(rel: string): Promise<WikiReadResult | { error: string }>
  /** 트리 진행 고리 — 펼친 폴더의 md 를 한 번에 센다. 체크박스가 없는 문서는 빠져서 온다 */
  checkboxCounts(rels: string[]): Promise<Record<string, import('../wiki/checkbox').CheckboxCount>>
  /** 편집 저장 — `edit: <slug>` 커밋. 잠금·충돌은 error 사유로 거절 */
  writeWikiPage(
    rel: string,
    text: string,
    baseHash: string
    /** hash = 저장한 글의 sha256 — 편집기가 남아 있으면(이름 바꾸기 실패) 다음 저장의 기준이다 */
  ): Promise<{ ok: true; hash: string } | { error: string }>
  /** 글·코드 파일 편집 저장 — `edit: <slug>` 커밋. md는 writeWikiPage 길로만 간다 */
  writeTextFile(
    rel: string,
    text: string,
    baseHash: string
  ): Promise<{ ok: true; hash: string } | { error: string }>
  /** 문서 기록 — 새것부터 버전 목록(이름이 바뀌기 전 기록 포함) */
  docHistory(rel: string): Promise<DocHistoryResult>
  /** 그 버전의 글 — 되돌리기는 이 글을 `writeWikiPage` 로 저장한다(편집 저장과 같은 확인) */
  docAt(rel: string, rev: string): Promise<{ text: string } | { error: string }>
  /** 붙여넣거나 끌어 놓은 파일을 `attachments/` 에 둔다 — 커밋은 그 파일을 건 글을 저장할 때 */
  saveAttachment(name: string, bytes: Uint8Array): Promise<{ rel: string } | { error: string }>
  /** 이 문서 이름을 링크 없이 적은 다른 문서의 줄 — 리더 아래 "링크 없이 언급한 곳" */
  unlinkedMentions(rel: string): Promise<import('../wiki/link-gaps').Mention[] | { error: string }>
  /** 태그 패널 — 문서 루트 전체의 태그(많이 쓴 순) */
  listTags(): Promise<import('../wiki/tags').TagEntry[] | { error: string }>
  /** 북마크한 문서 경로 — Obsidian 과 같은 `.obsidian/bookmarks.json` */
  listBookmarks(): Promise<string[]>
  /** 북마크를 달거나 뗀다 — 바뀐 목록을 돌려준다 */
  toggleBookmark(rel: string): Promise<{ bookmarks: string[] } | { error: string }>
  /** 보관함 `templates/` 의 마크다운 — 편집기의 "템플릿 넣기" 목록 */
  listTemplates(): Promise<{ rel: string; name: string }[]>
  /** 편집 잠금 사유(위키화·확정·lock 파일). null이면 저장 가능 */
  getEditLock(): Promise<string | null>
  /** 볼트 파일 변경 푸시(wiki/ 상대 경로 묶음, []는 상태 재확인 신호). 반환 함수로 해제한다. */
  onWikiChanged(listener: (rels: string[]) => void): () => void
}
