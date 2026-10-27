// 보관함 범위 정본 — 검색·채팅이 근거로 보는 "보관함 문서"(`isVaultDoc`)와
// 파일 트리·리더가 다루는 "보관함 파일"(`isVaultFile`)을 한 곳에서 나란히 정한다.
// 그래프는 `vaultGraphPaths`(아래)를 쓴다 — `wiki/` 전용이던 시절과 달리 볼트 전체를 그린다.
// 구조 점검(lint)은 `wiki/` 전용이다(WikiService.list·lint).
import { existsSync, readdirSync, realpathSync, type Dirent } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import type { VaultTreeEntry } from '../../shared/ipc-contract'
import { isTextFile } from '../../shared/vault-file-types'
import { git } from '../git'
import { realpathOrNearest, resolveInVault } from './vault-path'

/**
 * 읽기 루트 — 사람이 읽을 문서가 사는 곳. 팀 보관함 실측(`lemon/knowledge`, 2026-09-16)의
 * `docs/`(md 17건, 비개발자 온보딩)까지 포함한다. `private/` 는 개인 하루 노트다 — 채팅이 어제 노트를 근거로 읽는다.
 * `raw/`·`Clippings/` 는 위키화 전 원본이라 뺀다 — 넣으면 같은 내용이 원본·위키 두 번 인용된다.
 * `templates/` 는 빈 양식, 보관함 맨 위 .md(`VAULT_RULES.md`·`AGENTS.md`)는 보관함을 쓰는 규칙이라 뺀다.
 */
export const DOC_ROOTS = ['wiki', 'projects', 'outputs', 'areas', 'docs', 'private']

/** 문서가 아닌 폴더. 숨김(`.` 로 시작)은 이름과 무관하게 전부 뺀다 — `.git`·`.obsidian`·`.claude` */
const NOT_DOCS = new Set(['node_modules'])

const skip = (name: string): boolean => name.startsWith('.') || NOT_DOCS.has(name)

/** 그래프에서 빼는 폴더 — 위키화 전 원본·빈 양식. 어느 깊이든 이름이 같으면 뺀다.
 *  검색 범위(`vaultDocPaths`)는 맨 위 루트만 보라 중첩 raw 는 근거에 든다 — 그래프는 초안 묶음을
 *  그리지 않으려 일부러 더 뺀다. 숨김·node_modules는 skip 이 이미 뺀다 */
const NOT_GRAPH = new Set(['raw', 'Clippings', 'templates'])

/**
 * 그래프가 보는 볼트 전체 마크다운의 절대경로 — 경로순.
 * `DOC_ROOTS`와 분리한다 — courses·apps 같은 일반 루트와 루트 md도 점이 된다(Obsidian처럼).
 * 검색·채팅 근거는 `vaultDocPaths` 그대로다.
 */
export const vaultGraphPaths = (vaultDir: string): string[] => {
  if (!existsSync(vaultDir)) return []
  const out: string[] = []
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip(entry.name) || NOT_GRAPH.has(entry.name)) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = join(dir, entry.name)
      // 심링크 폴더는 따라가지 않는다 — Dirent 가 아니면 내려가지 않는다
      if (entry.isDirectory()) walk(full, rel)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) out.push(full)
    }
  }
  walk(vaultDir, '')
  return out.sort()
}

/** 보관함 상대경로가 문서인가 — 목록·검색이 보는 것과 채팅 근거 칩이 같은 판정을 쓴다 */
export const isVaultDoc = (rel: string): boolean => {
  const segments = rel.split('/')
  if (segments.some(skip)) return false
  if (!rel.endsWith('.md')) return false
  return segments.length > 1 && DOC_ROOTS.includes(segments[0]!)
}

/** 보관함 안 모든 마크다운 문서의 절대경로 — 경로순 */
export const vaultDocPaths = (vaultDir: string): string[] => {
  if (!existsSync(vaultDir)) return []
  const out: string[] = []
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip(entry.name)) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (prefix === '' && !DOC_ROOTS.includes(entry.name)) continue
        walk(full, rel)
      } else if (prefix !== '' && entry.isFile() && isVaultDoc(rel)) out.push(full)
    }
  }
  walk(vaultDir, '')
  return out.sort()
}

/** 보관함 상대경로가 트리·리더가 다루는 파일인가 — 숨김·node_modules 밖이면 형식을 가리지 않는다 */
export const isVaultFile = (rel: string): boolean =>
  rel !== '' && !rel.split('/').some((segment) => segment === '' || skip(segment))

/**
 * 기록(버전 목록·그때 글)을 내줄 수 있는 파일인가 — 트리가 다루는 파일 중 글자 파일.
 * `isVaultDoc` 보다 넓다: 문서 루트 밖과 md 가 아닌 글자 파일(html·코드)도 든다. 채팅 근거·검색 범위는 `isVaultDoc` 그대로다
 */
export const isHistoryFile = (rel: string): boolean => isVaultFile(rel) && isTextFile(rel)

/**
 * Obsidian 파일 탐색기와 같은 전체 목록 — 폴더와 파일을 평면으로. 중첩은 화면이 만든다.
 * 심링크는 따라가지 않는다. 보관함은 수천 항목이라 비동기로 걷는다 — 동기로 걸으면 main 이 선다.
 * 파일 stat 은 32개씩 끊어 동시에 띄운다 — 수천 파일 보관함에서 FD·메모리가 한 번에 치솟지 않게.
 */
const STAT_CONCURRENCY = 32

export const vaultTree = async (vaultDir: string): Promise<VaultTreeEntry[]> => {
  const out: VaultTreeEntry[] = []
  const statJobs: Array<() => Promise<void>> = []
  const walk = async (dir: string, prefix: string): Promise<void> => {
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      // 걷는 사이 지워진 폴더는 조용히 넘긴다. 맨 위를 못 읽으면 빈 보관함이 아니라 오류다
      if (errorCode(error) === 'ENOENT') return
      if (prefix === '') throw error
      console.error('could not read the vault folder', prefix, error)
      return
    }
    const pending: Promise<void>[] = []
    for (const entry of entries) {
      if (skip(entry.name) || entry.isSymbolicLink()) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        out.push({ rel, kind: 'dir', ext: '', mtimeMs: 0, size: 0 })
        pending.push(walk(full, rel))
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        statJobs.push(() =>
          stat(full).then(
            (st) => void out.push({ rel, kind: 'file', ext, mtimeMs: st.mtimeMs, size: st.size }),
            (error: unknown) => {
              // 걷는 사이 지워진 파일은 조용히 넘긴다
              if (errorCode(error) !== 'ENOENT')
                console.error('could not read the vault file', rel, error)
            }
          )
        )
      }
    }
    await Promise.all(pending)
  }
  if (!existsSync(vaultDir)) return []
  await walk(vaultDir, '')
  for (let i = 0; i < statJobs.length; i += STAT_CONCURRENCY) {
    await Promise.all(statJobs.slice(i, i + STAT_CONCURRENCY).map((job) => job()))
  }
  return out
}

const errorCode = (error: unknown): unknown => (error as { code?: unknown }).code

/** 채팅이 노트를 쓸 수 있는 곳 — 개인 노트·산출물. 위키·원본·규칙 파일은 사람과 위키화의 몫이다 */
const NOTE_PATTERNS = [/^private\/.+/, /^outputs\/.+/, /^projects\/[^/]+\/outputs\/.+/]

const inNoteScope = (rel: string): boolean =>
  isVaultFile(rel) &&
  rel.toLowerCase().endsWith('.md') &&
  NOTE_PATTERNS.some((pattern) => pattern.test(rel))

/**
 * 채팅 쓰기 범위 판정. 입력 경로와 심링크를 푼 실제 경로가 둘 다 범위 안이어야 한다 —
 * `private/` 안 링크가 `wiki/` 를 가리키면 막는다. `ignoredOnly` 는 승인 대기 중: git 이 무시하는
 * 경로만 허용해 노트 커밋이 승인 목록에 섞이지 않게 한다.
 */
export const allowedForNote = (
  vaultDir: string,
  rel: string,
  opts: { ignoredOnly?: boolean } = {}
): boolean => {
  const full = resolveInVault(vaultDir, rel)
  if (full === null) return false
  const lexical = relative(vaultDir, full).split(sep).join('/')
  const real = realpathOrNearest(full)
  if (real === null) return false
  const realRel = relative(realpathSync(vaultDir), real).split(sep).join('/')
  if (!inNoteScope(lexical) || !inNoteScope(realRel)) return false
  if (!opts.ignoredOnly) return true
  return ignoredByGit(vaultDir, lexical)
}

/** `git check-ignore` — exit 0 = 무시, 1 = 추적 대상 */
export const ignoredByGit = (vaultDir: string, rel: string): boolean => {
  try {
    git(vaultDir, ['check-ignore', '-q', '--', rel])
    return true
  } catch (error) {
    if ((error as { status?: number }).status === 1) return false
    throw error
  }
}

/** renderer 가 보낸 "지금 열린 문서" — 보관함 안의 파일 경로면 그대로, 아니면 null */
export const vaultFileOrNull = (vaultDir: string, rel: unknown): string | null =>
  typeof rel === 'string' && isVaultFile(rel) && resolveInVault(vaultDir, rel) !== null ? rel : null
