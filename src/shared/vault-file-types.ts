/**
 * 보관함 파일 확장자 정본 — 어떤 종류로 보여 주고 어떤 Content-Type 으로 서브하나.
 * 목록은 Obsidian 이 기본으로 여는 형식을 따른다(obsidian.md/help/file-formats, 2026-09-20 확인):
 * 그림 avif bmp gif jpeg jpg png svg webp · 소리 flac m4a mp3 ogg wav 3gp · 영상 mkv mov mp4 ogv webm ·
 * 그 밖 base canvas pdf. `.webm` 은 소리만 든 것도 `<video>` 가 재생하므로 영상으로 둔다.
 * 코드(js·ts·sql·css·설정·기록)는 Obsidian 목록 밖이지만 기본 편집기로 읽히니 `code` 로 글자만 보여 준다.
 * `vault://`(main)와 미리보기·리더(renderer)가 같은 표를 읽는다 — 형식 추가는 여기 한 곳이다.
 */
export type VaultFileKind =
  | 'markdown'
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'json'
  | 'html'
  | 'code'
  | 'base'
  | 'canvas'
  | 'office'
  | 'other'

/**
 * `mime` 이 없는 종류는 `vault://` 로 서브하지 않는다 — 읽는 길이 따로 있다(.base 는 IPC).
 */
type VaultFileType = { kind: VaultFileKind; mime?: string }

const TYPES: Record<string, VaultFileType> = {
  '.md': { kind: 'markdown', mime: 'text/markdown; charset=utf-8' },
  '.markdown': { kind: 'markdown', mime: 'text/markdown; charset=utf-8' },
  // mdx 의 JSX·import 줄은 글자로 남는다 — 본문을 읽는 것이 목적이다
  '.mdx': { kind: 'markdown', mime: 'text/markdown; charset=utf-8' },
  '.txt': { kind: 'text', mime: 'text/plain; charset=utf-8' },
  '.avif': { kind: 'image', mime: 'image/avif' },
  '.bmp': { kind: 'image', mime: 'image/bmp' },
  '.gif': { kind: 'image', mime: 'image/gif' },
  '.jpeg': { kind: 'image', mime: 'image/jpeg' },
  '.jpg': { kind: 'image', mime: 'image/jpeg' },
  '.png': { kind: 'image', mime: 'image/png' },
  '.svg': { kind: 'image', mime: 'image/svg+xml' },
  '.webp': { kind: 'image', mime: 'image/webp' },
  '.3gp': { kind: 'audio', mime: 'audio/3gpp' },
  '.flac': { kind: 'audio', mime: 'audio/flac' },
  '.m4a': { kind: 'audio', mime: 'audio/mp4' },
  '.mp3': { kind: 'audio', mime: 'audio/mpeg' },
  '.ogg': { kind: 'audio', mime: 'audio/ogg' },
  '.wav': { kind: 'audio', mime: 'audio/wav' },
  '.mkv': { kind: 'video', mime: 'video/x-matroska' },
  '.mov': { kind: 'video', mime: 'video/quicktime' },
  '.mp4': { kind: 'video', mime: 'video/mp4' },
  '.ogv': { kind: 'video', mime: 'video/ogg' },
  '.webm': { kind: 'video', mime: 'video/webm' },
  '.pdf': { kind: 'pdf', mime: 'application/pdf' },
  // json·html·code 는 글자로만 내준다 — 권한 스킴(standard·secure)이 볼트 html 을 실행 가능한 문서로
  // 서브하면 그 글이 곧 페이지가 된다. 미리보기는 글자를 받아 제 손으로 그린다
  '.json': { kind: 'json', mime: 'text/plain; charset=utf-8' },
  '.htm': { kind: 'html', mime: 'text/plain; charset=utf-8' },
  '.html': { kind: 'html', mime: 'text/plain; charset=utf-8' },
  '.base': { kind: 'base' },
  '.canvas': { kind: 'canvas' },
  // 워드·파워포인트는 원본 바이트를 내주지 않는다 — main 이 `vault://…?preview` 로 그림까지 담은 HTML 로 바꿔 내준다
  '.docx': { kind: 'office' },
  '.pptx': { kind: 'office' }
}

// 코드·설정·기록 — 구문 색이 있는 확장자는 미리보기에서 색을 입힌다. 실행되지 않게 text/plain 으로만 서브한다.
const CODE_MIME = 'text/plain; charset=utf-8'

/** 코드로 읽는 확장자 — 목록을 늘리면 미리보기·vault:// 가 같이 따라온다 */
const CODE_EXTS = [
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.mts',
  '.cts',
  '.tsx',
  '.sql',
  '.css',
  '.scss',
  '.less',
  '.xml',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.csv',
  '.tsv',
  '.jsonl',
  '.ndjson',
  '.diff',
  '.patch',
  '.log',
  '.sh',
  '.bash',
  '.zsh',
  '.py',
  '.rb',
  '.php',
  '.java',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cc',
  '.go',
  '.rs',
  '.swift',
  '.kt',
  '.kts',
  '.vue',
  '.svelte',
  '.r',
  '.lua',
  '.pl',
  '.ps1'
]

for (const ext of CODE_EXTS) TYPES[ext] = { kind: 'code', mime: CODE_MIME }

/** 소문자 확장자(`.png`) — 점이 없으면 빈 문자열 */
export const extOf = (path: string): string => {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

export const fileKind = (path: string): VaultFileKind => TYPES[extOf(path)]?.kind ?? 'other'

/**
 * 글자로 읽는 종류 — 기록(버전 목록·줄 비교)을 볼 수 있다.
 * main 의 기록 판정(`isHistoryFile`)과 미리보기 머리의 기록 단추가 같은 표를 읽는다
 */
const TEXT_KINDS: ReadonlySet<VaultFileKind> = new Set(['markdown', 'text', 'code', 'json', 'html'])

export const isTextFile = (path: string): boolean => TEXT_KINDS.has(fileKind(path))

/** `vault://` 가 서브할 수 있는 형식이면 Content-Type, 아니면 null */
export const mimeOf = (path: string): string | null => TYPES[extOf(path)]?.mime ?? null

/** 통째로 읽지 않고 흘려보내는 종류 — 영상·소리는 수백 MB 가 되고 탐색이 필요하다 */
export const isStreamed = (path: string): boolean => {
  const kind = fileKind(path)
  return kind === 'audio' || kind === 'video'
}

/** 보관함 파일을 읽는 주소 — 만드는 법은 한 곳이다(호스트는 무시되고 경로만 본다).
 * encodeURI 는 `#`·`?` 를 살려 프래그먼트·쿼리로 잘리므로 조각별로 인코딩한다 */
export const vaultUrl = (rel: string): string =>
  `vault://local/${rel.split('/').map(encodeURIComponent).join('/')}`
