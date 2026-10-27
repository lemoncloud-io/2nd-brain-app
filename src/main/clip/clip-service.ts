// 신뢰 경계(외부 URL·임의 파일) 하드닝이 여기서 끝난다.
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { pdfText } from './pdf-text'
import { hwpxText } from './hwpx-text'
import { hwpText } from './hwp-text'
import { docxText } from './docx-text'
import { pptxText } from './pptx-text'
import {
  capText,
  MAX_CLIP_FILE_BYTES,
  stripImageMarks,
  UnsupportedDocument,
  yamlScalar
} from './clip-text'
import { xlsxText } from './xlsx-text'
import { CLIP_FILE_TYPES } from '../../shared/ipc-contract'
import { resolveInVault } from '../vault/vault-path'
import { INGEST_LOCK } from '../engine/claude-engine'
import { defaultBranchOf, notOnDefaultReason } from '../engine/work-branch'
import { git } from '../git'
import { realpathSync } from 'node:fs'
import { fetchPage, htmlToMarkdown, PAGE_TYPES, type PageFailure } from './web-page'
import { mainT } from '../i18n'

export type AddResult = { ok: true; path: string } | { ok: false; reason: string }

/** 웹 페이지 하나의 상한 — 주소 넣기 응답과 웹 탭 담기가 같이 쓴다 */
export const MAX_PAGE_BYTES = 10 * 1024 * 1024
const TIMEOUT_MS = 30_000

const clippingsDir = (vaultDir: string): string => {
  const dir = join(vaultDir, 'Clippings')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 동명 점유가 원자적이다 — 빈 파일을 먼저 깔아 이름을 맡는다(note.md → note-1.md → note-2.md).
 * 앱이 둘(두 창·재시도) 떠 있어도 겹쳐 눌러 덮어쓰지 않는다. 점유가 끝나면 그 자리에 쓰면 된다.
 * 이름이 이상하면 같은 자리에 두지 않는다 — 부르는 쪽이 먼저 검사한다
 */
export const claimUniquePath = (dir: string, name: string): string => {
  const ext = name.endsWith('.md') ? '.md' : ''
  const stem = name.slice(0, name.length - ext.length)
  for (let n = 0; ; n += 1) {
    const candidate = resolve(join(dir, n === 0 ? name : `${stem}-${n}${ext}`))
    try {
      closeSync(openSync(candidate, 'wx'))
      return candidate
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
}

const slugOf = (title: string, fallback: string): string =>
  title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || fallback

/** 옛 형식은 "받지 않는다" 목록 문장 대신 다음 행동을 말한다 — 비개발자에게 목록 문장은 막다른 길이다 */
const OLD_FORMATS: Partial<Record<string, () => string>> = {
  '.xls': () => mainT().clipMain.oldXls,
  '.doc': () => mainT().clipMain.oldDoc,
  '.ppt': () => mainT().clipMain.oldPpt
}

/** 글자와 그림 개수를 뽑는 문서 — unreadable 은 열지 못했을 때 보이는 문장이다 */
type DocumentReader = {
  read: (path: string) => Promise<{ text: string; images: number }>
  unreadable: () => string
}

const DOCUMENT_READERS: Partial<Record<string, DocumentReader>> = {
  '.hwpx': { read: hwpxText, unreadable: () => mainT().clipMain.hwpUnreadable },
  '.hwp': { read: hwpText, unreadable: () => mainT().clipMain.hwpUnreadable },
  '.docx': { read: docxText, unreadable: () => mainT().clipMain.wordUnreadable },
  '.pptx': { read: pptxText, unreadable: () => mainT().clipMain.pptUnreadable }
}

// .md 는 그대로 복사, .txt 는 본문 그대로, 그 밖의 문서는 뽑은 글자로 frontmatter 붙인 .md 를 만든다(원본 파일은 source 에 이름만)
export const addFile = async (vaultDir: string, srcPath: string): Promise<AddResult> => {
  const ext = extname(srcPath).toLowerCase()
  const oldFormat = OLD_FORMATS[ext]
  if (oldFormat) return { ok: false, reason: oldFormat() }
  if (!CLIP_FILE_TYPES.includes(ext)) {
    return {
      ok: false,
      reason: mainT().clipMain.unsupported(
        ext || mainT().clipMain.noExtension,
        CLIP_FILE_TYPES.join('·')
      )
    }
  }
  // 통째로 메모리에 올리는 경로다 — 크기부터 본다(URL 은 MAX_PAGE_BYTES 가 같은 일을 한다).
  // 드롭 뒤 지워지면 statSync 가 던진다 — 계약(AddResult)대로 거절로 돌린다
  let size: number
  try {
    size = statSync(srcPath).size
  } catch {
    return { ok: false, reason: mainT().clipMain.goneAfterDrop }
  }
  if (size > MAX_CLIP_FILE_BYTES) {
    return { ok: false, reason: mainT().clipMain.tooBig }
  }
  const name = basename(srcPath)
  const title = name.slice(0, name.length - ext.length)
  if (ext === '.txt') {
    // stat 뒤에 지워지거나 권한이 바뀌면 읽기가 던진다 — 계약(AddResult)대로 거절로 돌린다
    let raw: string
    try {
      raw = await readFile(srcPath, 'utf8')
    } catch {
      return { ok: false, reason: mainT().clipMain.fileUnreadable }
    }
    return writeClipping(vaultDir, slugOf(title, 'note'), title, name, capText(raw))
  }
  if (ext === '.pdf') {
    let text: string
    try {
      text = await pdfText(srcPath)
    } catch (error) {
      console.error('PDF read failed', srcPath, error)
      return { ok: false, reason: mainT().clipMain.pdfUnreadable }
    }
    if (!text) {
      return {
        ok: false,
        reason: mainT().clipMain.pdfNoText
      }
    }
    return writeClipping(vaultDir, slugOf(title, 'document'), title, name, `${text}\n`)
  }
  const reader = DOCUMENT_READERS[ext]
  if (reader) {
    let text: string
    let images: number
    try {
      ;({ text, images } = await reader.read(srcPath))
    } catch (error) {
      if (error instanceof UnsupportedDocument) return { ok: false, reason: error.message }
      console.error('document read failed', srcPath, error)
      return { ok: false, reason: mainT().clipMain.damaged(reader.unreadable()) }
    }
    // 그림 자리표(와 대체 텍스트)만 남은 문서는 글자가 없는 문서다
    if (!stripImageMarks(text).trim()) {
      return {
        ok: false,
        reason: images > 0 ? mainT().clipMain.docImagesOnly : mainT().clipMain.docNoText
      }
    }
    return writeClipping(vaultDir, slugOf(title, 'document'), title, name, `${text}\n`)
  }
  if (ext === '.xlsx') {
    let text: string
    try {
      text = await xlsxText(srcPath)
    } catch (error) {
      if (error instanceof UnsupportedDocument) return { ok: false, reason: error.message }
      console.error('xlsx read failed', srcPath, error)
      return { ok: false, reason: mainT().clipMain.xlsxUnreadable }
    }
    if (!text) {
      return { ok: false, reason: mainT().clipMain.xlsxEmpty }
    }
    return writeClipping(vaultDir, slugOf(title, 'sheet'), title, name, `${text}\n`)
  }
  // basename은 임의 외부 파일명 — resolveInVault로 Clippings/ 안인지 먼저 검사하고 맡는다
  if (resolveInVault(vaultDir, `Clippings/${title}.md`) === null) {
    return { ok: false, reason: mainT().clipMain.badFileName }
  }
  const dest = claimUniquePath(clippingsDir(vaultDir), `${title}.md`)
  // stat 뒤에 지워지거나 폴더·권한 문제면 복사가 던진다 — 거절로 돌린다
  try {
    copyFileSync(srcPath, dest)
  } catch {
    return { ok: false, reason: mainT().clipMain.fileUnreadable }
  }
  return { ok: true, path: dest }
}

export type AddTextInput = {
  originVaultDir?: string
  title: string
  question: string
  answer: string
  source: string
}

const writeClipping = (
  vaultDir: string,
  safeSlug: string,
  title: string,
  source: string,
  body: string
): AddResult => {
  const date = new Date().toISOString().slice(0, 10)
  const name = `${date}-${safeSlug}.md`
  if (resolveInVault(vaultDir, `Clippings/${name}`) === null) {
    return { ok: false, reason: mainT().clipMain.badTitle }
  }
  const dest = claimUniquePath(clippingsDir(vaultDir), name)
  // 제목·출처는 외부 입력이다 — 줄바꿈이나 `---` 로 frontmatter 를 끝내거나 키를 더하지 못하게 YAML 스칼라로 쓴다
  const frontmatter = `---\ntitle: ${yamlScalar(title)}\nsource: ${yamlScalar(source)}\nclipped: ${new Date().toISOString()}\n---\n\n`
  writeFileSync(dest, frontmatter + body)
  return { ok: true, path: dest }
}

/** 저장해도 되는 때인가 — 위키화 진행 중·작업 브랜치·다른 보관함에서 나온 답이면 거절 사유 */
const saveBlocked = (vaultDir: string, originVaultDir: string | undefined): string | null => {
  const real = (dir: string): string | null => {
    try {
      return realpathSync(dir)
    } catch {
      return null
    }
  }
  // originVaultDir 없으면 볼트 출처가 아니다 — 불일치 검사 생략
  if (originVaultDir !== undefined && real(originVaultDir) !== real(vaultDir)) {
    return mainT().clipMain.otherVault
  }
  if (existsSync(join(vaultDir, INGEST_LOCK))) return mainT().clipMain.ingestRunning
  const defaultBranch = defaultBranchOf(vaultDir)
  if (!defaultBranch) return mainT().mainErrors.noDefaultBranch
  const current = git(vaultDir, ['branch', '--show-current']).trim()
  if (current !== defaultBranch) return notOnDefaultReason(current, mainT().mainErrors.thenSave)
  return null
}

// 바깥에서 온 글 저장(첫 실행 샘플) — 위키화 입력함(Clippings)으로 간다
export const addText = (vaultDir: string, input: AddTextInput): AddResult => {
  const blocked = saveBlocked(vaultDir, input.originVaultDir)
  if (blocked) return { ok: false, reason: blocked }
  const safeSlug = slugOf(input.title, 'note')
  // ui-hangul-ignore: 보관함에 남는 노트 본문(D8)
  const body = `## 질문\n\n${input.question}\n\n## 답\n\n${input.answer}\n`
  return writeClipping(vaultDir, safeSlug, input.title, input.source, body)
}

export type AddAnswerInput = {
  originVaultDir?: string
  question: string
  answer: string
  /** 답이 근거로 쓴 보관함 문서 */
  refs: string[]
}

/** 근거 표기 — 위키 문서는 따옴표 친 wikilink, 그 밖은 경로 문자열(VAULT_RULES § Note Contracts) */
const sourceOf = (rel: string): string =>
  rel.startsWith('wiki/') && rel.endsWith('.md') ? `[[${basename(rel, '.md')}]]` : rel

/**
 * 채팅 답 남기기 — 보관함 규칙(VAULT_RULES § Directory Contract): 질의 답은 `outputs/` 에 남긴다.
 * Clippings 는 바깥 자료의 입력함이다 — 위키에서 나온 답을 거기 넣으면 위키가 자기 답을 출처로 다시 먹는다.
 * 모양은 `templates/query-output.md` 를 따른다.
 */
export const addAnswer = (vaultDir: string, input: AddAnswerInput): AddResult => {
  const blocked = saveBlocked(vaultDir, input.originVaultDir)
  if (blocked) return { ok: false, reason: blocked }
  const question = input.question.trim()
  // ui-hangul-ignore: 보관함에 남는 노트 제목(D8)
  const title = question.split('\n')[0].slice(0, 80) || '채팅 답'
  const day = new Date().toISOString().slice(0, 10)
  const dir = join(vaultDir, 'outputs')
  mkdirSync(dir, { recursive: true })
  const name = `${day}-${slugOf(title.slice(0, 40), 'answer')}.md`
  if (resolveInVault(vaultDir, `outputs/${name}`) === null) {
    return { ok: false, reason: mainT().clipMain.badQuestion }
  }
  const dest = claimUniquePath(dir, name)
  const sources = input.refs.map(sourceOf)
  const frontmatter =
    `---\ntype: query-output\ncreated: "${day}"\nquestion: ${yamlScalar(question)}\n` +
    `sources: [${sources.map(yamlScalar).join(', ')}]\n---\n\n`
  const evidence =
    sources.length === 0
      ? ''
      : `## Evidence\n\n${sources.map((s) => (s.startsWith('[[') ? `- ${s}` : `- \`${s}\``)).join('\n')}\n\n`
  writeFileSync(
    dest,
    `${frontmatter}# ${title}\n\n## Answer\n\n${input.answer.trim()}\n\n${evidence}`
  )
  return { ok: true, path: dest }
}

export const pageTooBig = (): string => mainT().clipMain.pageTooBig(MAX_PAGE_BYTES / 1024 / 1024)

// 네트워크 오류 코드(ENOTFOUND 등)는 괄호 안에만 남긴다
const FETCH_FAILED: Record<PageFailure, (detail: string) => string> = {
  silent: () => mainT().clipMain.silent,
  redirects: () => mainT().clipMain.redirects,
  'too-big': pageTooBig,
  timeout: () => mainT().clipMain.timeout,
  // 자료 넣기는 안쪽 주소를 막지 않는다 — 이 줄은 타입을 채울 뿐이다
  inside: () => mainT().clipMain.unreachable,
  unreachable: (detail) => `${mainT().clipMain.unreachable} (${detail})`
}

/** http(s) 주소만 — 아니면 null */
const webUrlOf = (raw: string): URL | null => {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

export const addUrl = async (vaultDir: string, rawUrl: string): Promise<AddResult> => {
  const url = webUrlOf(rawUrl)
  if (url === null) return { ok: false, reason: mainT().clipMain.notWebAddress }

  const fetched = await fetchPage(url, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_PAGE_BYTES })
  if ('failed' in fetched) {
    return { ok: false, reason: FETCH_FAILED[fetched.failed](fetched.detail ?? '') }
  }
  if (fetched.status !== 200) {
    return {
      ok: false,
      reason: mainT().clipMain.httpFailed(fetched.status)
    }
  }
  if (!PAGE_TYPES.includes(fetched.type)) {
    return {
      ok: false,
      reason: mainT().clipMain.notText(fetched.type || mainT().clipMain.unknownType)
    }
  }

  const text = fetched.body.toString('utf8')
  let title: string
  let body: string
  if (fetched.type === 'text/html') {
    const converted = htmlToMarkdown(text, url.href)
    title = converted.title
    body = converted.md
  } else {
    title = url.hostname
    body = text
  }

  const safeSlug = slugOf(title, 'clipping')
  return writeClipping(vaultDir, safeSlug, title, url.href, body)
}

/**
 * 웹 탭에 그려진 페이지 담기 — 서버에서 다시 가져오지 않고 사용자가 본 html(스크립트가 그린 글·로그인 뒤 페이지)을
 * 그대로 쓴다. 변환·저장은 주소 넣기(`addUrl`)의 html 길과 같다
 */
export const addPage = (vaultDir: string, rawUrl: string, html: string): AddResult => {
  const url = webUrlOf(rawUrl)
  if (url === null) return { ok: false, reason: mainT().clipMain.notWebAddress }
  if (Buffer.byteLength(html, 'utf8') > MAX_PAGE_BYTES) {
    return { ok: false, reason: pageTooBig() }
  }
  const { title, md } = htmlToMarkdown(html, url.href)
  return writeClipping(vaultDir, slugOf(title, 'clipping'), title, url.href, md)
}
