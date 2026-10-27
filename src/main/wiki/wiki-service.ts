import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { resolveInVault } from '../vault/vault-path'
import { ignoredByGit, isVaultFile, vaultDocPaths, vaultGraphPaths } from '../vault/vault-scope'
import { fileKind } from '../../shared/vault-file-types'
import { vaultKindOf } from '../vault/vault-service'
import {
  parseWikiPage,
  resolveLink,
  type PageRef,
  type WikiLink,
  type WikiPage
} from '../../shared/wiki/parse'
import { git } from '../git'
import { appIdentity } from '../vault/app-identity'
import { defaultBranchOf, isWorkBranch, notOnDefaultReason } from '../engine/work-branch'
import { INGEST_LOCK } from '../engine/claude-engine'
import { commitBlockedReason } from '../vault/sync-service'
import { referencedAttachments } from '../vault/attachments'
import { pageTags, tagIndex, type TagEntry } from '../../shared/wiki/tags'
import { unlinkedMentions, type Mention } from '../../shared/wiki/link-gaps'
import { vaultActivity } from '../vault/vault-activity'
import { CHECKBOX_BATCH, countCheckboxes, type CheckboxCount } from '../../shared/wiki/checkbox'
import type { BacklinkEntry } from '../../shared/wiki/backlinks'
import type { SearchablePage } from '../../shared/wiki/search'
import { lintStructure, type LintReport } from '../../shared/wiki/lint'
import type { GraphPageInput } from '../../shared/wiki/graph'
import { verifyVault, type VerifyOutcome } from '../verify/vault-verify'
import type { SweepPage } from '../../shared/review-sweep'
import { mainT } from '../i18n'

export type WriteResult =
  { ok: true; commit: string | null; baseCommit: string | null } | { ok: false; reason: string }

export interface WikiListEntry extends Omit<WikiPage, 'body'> {
  mtimeMs: number
  size: number
}

export interface WikiReadResult {
  text: string
  /** sha256(text) — 편집 충돌 검사용 (슬라이스 05) */
  hash: string
}

/** 페이지 파싱 캐시 — rel 별로 마지막 mtime 의 파싱 결과. mtime 이 같으면 파일을 다시 읽지 않는다
 *  (watcher 가 무효화하지 않아도 mtime 비교라 안전). 목록·검색·임베딩이 같은 캐시를 쓴다.
 *  상한을 둔다 — 볼트를 옮겨 다녀도 옛 볼트 항목이 main 메모리에 영구 누적되지 않는다. */
const PAGE_CACHE_MAX = 5000
const pageCache = new Map<string, { mtimeMs: number; size: number; page: WikiPage }>()

const readPage = (
  vaultDir: string,
  full: string
): { mtimeMs: number; size: number; page: WikiPage } => {
  const rel = toPosixRel(vaultDir, full)
  const st = statSync(full)
  const key = `${vaultDir}\u0000${rel}`
  const cached = pageCache.get(key)
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return cached
  const entry = {
    mtimeMs: st.mtimeMs,
    size: st.size,
    page: parseWikiPage(rel, readFileSync(full, 'utf8'))
  }
  if (!pageCache.has(key) && pageCache.size >= PAGE_CACHE_MAX) {
    const oldest = pageCache.keys().next()
    if (!oldest.done) pageCache.delete(oldest.value)
  }
  pageCache.set(key, entry)
  return entry
}

/** vaultDir 기준 posix 상대경로 — 목록·lint·read/write 판정에 공통으로 쓰는 정규화 */
const toPosixRel = (vaultDir: string, full: string): string =>
  relative(vaultDir, full).split(sep).join('/')

const scanMd = (dir: string): string[] => {
  const out: string[] = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name)
    if (name.isDirectory()) out.push(...scanMd(full))
    else if (name.isFile() && name.name.endsWith('.md')) out.push(full)
  }
  return out
}

/** `wiki/` 하위 모든 md의 절대경로 — generic 폴더처럼 wiki/ 자체가 없으면 빈 목록 */
const scanWikiDir = (vaultDir: string): string[] => {
  try {
    return scanMd(join(vaultDir, 'wiki'))
  } catch {
    return []
  }
}

// wiki 페이지로 풀리지 않는 링크 중 볼트 안에 실제 파일이 있는 것에 vaultFile 을 단다 — 볼트 규칙은
// [[projects/x/README]] 같은 볼트 문서 링크를 쓴다. 파싱 캐시의 페이지는 고치지 않고 바뀐 것만 새로 만든다
const markVaultFileLinks = <T extends { rel: string; slug: string; links: WikiLink[] }>(
  vaultDir: string,
  pages: T[]
): T[] => {
  const index: PageRef[] = pages.map((p) => ({ rel: p.rel, slug: p.slug }))
  const known = new Map<string, boolean>()
  const isVaultFile = (target: string): boolean => {
    const rel = `${target.replace(/\.md$/, '')}.md`
    let hit = known.get(rel)
    if (hit === undefined) {
      // 볼트 밖을 가리키는 경로(../ 등)는 resolveInVault 가 null 로 막는다
      const full = resolveInVault(vaultDir, rel)
      hit = full !== null && existsSync(full)
      known.set(rel, hit)
    }
    return hit
  }
  return pages.map((page) => {
    let changed = false
    const links = page.links.map((link) => {
      if (resolveLink(link.target, index).rel !== null || !isVaultFile(link.target)) return link
      changed = true
      return { ...link, vaultFile: true }
    })
    return changed ? { ...page, links } : page
  })
}

// git 저장소가 아니면 기본 브랜치를 못 읽는다 — 그때도 검증기는 돌고, git 을 쓰는 점검이 "could not run" 결함으로 알린다
const lintBase = (vaultDir: string): string => {
  try {
    return defaultBranchOf(vaultDir) ?? 'main'
  } catch {
    return 'main'
  }
}

const isMarkdownFile = (rel: string): boolean =>
  isVaultFile(rel) && rel.toLowerCase().endsWith('.md')

export const WikiService = {
  // `wiki` 하위 모든 md 목록 — 바뀌지 않은 파일은 stat 만 하고 파싱 캐시를 쓴다.
  // generic 폴더(Obsidian任意)에는 wiki/ 가 없다 — throw 대신 빈 목록
  list(vaultDir: string): WikiListEntry[] {
    const pages: WikiListEntry[] = []
    for (const full of scanWikiDir(vaultDir)) {
      const { mtimeMs, size, page } = readPage(vaultDir, full)
      const { body: _body, ...meta } = page
      void _body // IPC 페이로드에서 본문 제외 목적의 구조 분해
      pages.push({ ...meta, mtimeMs, size })
    }
    pages.sort((a, b) => a.rel.localeCompare(b.rel))
    return markVaultFileLinks(vaultDir, pages)
  },

  /** 위키 페이지의 경로·이름·제목만 — `list` 의 정렬·볼트 파일 링크 표시 없이 같은 파싱 캐시를 쓴다.
   * generic 폴더에는 wiki/ 가 없다 — throw 대신 빈 목록 */
  pageRefs(vaultDir: string): SweepPage[] {
    return scanWikiDir(vaultDir).map((full) => {
      const { rel, slug, title } = readPage(vaultDir, full).page
      return { rel, slug, title }
    })
  },

  /**
   * 그래프 입력 — 볼트 전체 md(그래프 범위). rel·slug·frontmatter·links를 담고
   * 볼트 파일 링크 표시까지 한다. wiki/ 없는 generic 폴더에서도 그려진다.
   * 검색·채팅 근거(`listDocs`)와 범위가 다르다 — 그쪽은 손대지 않는다.
   */
  listGraphPages(vaultDir: string): GraphPageInput[] {
    const pages: GraphPageInput[] = []
    for (const full of vaultGraphPaths(vaultDir)) {
      const { page } = readPage(vaultDir, full)
      pages.push({
        rel: page.rel,
        slug: page.slug,
        frontmatter: page.frontmatter,
        links: page.links
      })
    }
    pages.sort((a, b) => a.rel.localeCompare(b.rel))
    return markVaultFileLinks(vaultDir, pages)
  },

  /**
   * 검색·임베딩·채팅 입력 — 읽기 루트(`vault-scope.ts` `DOC_ROOTS`)의 마크다운 문서.
   * `wiki/` 밖 `projects/`·`outputs/`·`areas/` 가 들어오고 `raw/`·`Clippings/`·`templates/`·루트 .md 는 빠진다. 페이지마다 frontmatter 뺀 본문(파싱 캐시를 위키 목록과 같이 쓴다).
   */
  listDocs(
    vaultDir: string
  ): (SearchablePage & Pick<BacklinkEntry, 'links'> & { mtimeMs: number })[] {
    return vaultDocPaths(vaultDir)
      .map((full) => {
        const { mtimeMs, page } = readPage(vaultDir, full)
        // frontmatter 는 스니펫·본문 매칭에서 뺀다 — 제목은 page.title 로 따로 들어간다
        return {
          rel: page.rel,
          slug: page.slug,
          title: page.title,
          body: page.body,
          tags: pageTags(page),
          links: page.links,
          mtimeMs
        }
      })
      .sort((a, b) => a.rel.localeCompare(b.rel))
  },

  /** 이 문서 이름을 링크 없이 적은 줄 — 문서 루트 전체(파싱 캐시). 문서를 못 읽으면 빈 목록 */
  unlinkedMentions(vaultDir: string, rel: string): Mention[] {
    const read = WikiService.read(vaultDir, rel)
    if (read === null) return []
    const page = parseWikiPage(rel, read.text)
    return unlinkedMentions(page, WikiService.listDocs(vaultDir))
  },

  /** 태그 패널 — 문서 루트 전체의 태그와 쓴 문서(파싱 캐시를 목록과 같이 쓴다) */
  tags(vaultDir: string): TagEntry[] {
    return tagIndex(WikiService.listDocs(vaultDir).map((p) => ({ rel: p.rel, tags: p.tags ?? [] })))
  },

  /** 구조 lint(슬라이스 09) — 결정론 점검 + `vault_verify --lane none`. 테스트에서 verify 주입 */
  async lint(
    vaultDir: string,
    opts: { verify?: () => Promise<VerifyOutcome> } = {}
  ): Promise<LintReport> {
    const pages: WikiPage[] = []
    // generic 폴더에는 wiki/ 가 없다 — 구조 결함 없음으로, verify 판정은 그대로 돌린다
    for (const full of scanWikiDir(vaultDir)) {
      pages.push(parseWikiPage(toPosixRel(vaultDir, full), readFileSync(full, 'utf8')))
    }
    const structure = lintStructure(markVaultFileLinks(vaultDir, pages))
    const verify =
      opts.verify ??
      ((): Promise<VerifyOutcome> =>
        Promise.resolve(verifyVault({ vaultDir, base: lintBase(vaultDir), lane: 'none' })))
    return { structure, verify: await verify() }
  },

  /** 문서 원문 읽기 — 숨김 폴더 밖의 모든 md(`isVaultFile`). 파일 트리가 여는 것과 같다 */
  read(vaultDir: string, rel: string): WikiReadResult | null {
    const full = resolveInVault(vaultDir, rel)
    if (full === null) return null
    // 입력이 아닌 해석된 경로로 판정 — `wiki/../INDEX.md` 우회 차단
    const normalized = toPosixRel(vaultDir, full)
    if (!isMarkdownFile(normalized)) return null
    try {
      const text = readFileSync(full, 'utf8')
      return { text, hash: createHash('sha256').update(text).digest('hex') }
    } catch {
      return null
    }
  },

  /**
   * 파일 트리의 진행 고리 — 펼친 폴더의 md 를 한 번에 세어 준다(행마다 IPC 를 부르지 않는다).
   * 체크박스가 없는 문서는 빼고 돌려준다: 트리는 고리를 그릴 행만 알면 된다.
   * 수백 개를 통째로 읽으면 실행이 멈춘다 — 한 번에 세는 파일 수를 막아 둔다.
   */
  async checkboxCounts(vaultDir: string, rels: string[]): Promise<Record<string, CheckboxCount>> {
    const counts: Record<string, CheckboxCount> = {}
    // 동기로 읽으면 수백 개를 세는 동안 main 이벤트 루프가 멈춘다 — 화면이 그만큼 굳는다
    await Promise.all(
      rels.slice(0, CHECKBOX_BATCH).map(async (rel) => {
        const full = resolveInVault(vaultDir, rel)
        // 해석된 경로로 판정한다 — `wiki/../x.md` 우회 차단(read 와 같은 규칙)
        if (full === null || !isMarkdownFile(toPosixRel(vaultDir, full))) return
        try {
          const count = countCheckboxes(await readFile(full, 'utf8'))
          if (count.total > 0) counts[rel] = count
        } catch {
          // 그 사이 지워졌거나 못 읽는 파일 — 그 행만 고리 없이 그린다
        }
      })
    )
    return counts
  },

  /**
   * 편집 저장 — 지금 줄기에 `edit: <slug>` 커밋 1개. 어제의 작업 브랜치에 남아 있어도 저장한다
   * (받기가 그 자리에서 팀 최신을 합친다). 승인 대기 중인 위키화 브랜치·브랜치 밖에서는 거절한다.
   * git 이 무시하는 파일(개인 노트)과 git 기록이 없는 보관함은 커밋 없이 저장만 한다.
   * generic 폴더(읽기 중심)도 파일만 저장하고 커밋하지 않는다 — git 줄기 상태와 무관하다.
   * 거절 순서: 경로 → 잠금(활동·lock 파일) → HEAD 브랜치 → 파일 없음 → hash 불일치.
   * 내용이 디스크와 같으면 커밋 없이 성공(no-op).
   */
  write(vaultDir: string, rel: string, text: string, baseHash: string): WriteResult {
    const full0 = resolveInVault(vaultDir, rel)
    if (full0 === null) return { ok: false, reason: mainT().mainErrors.badPath }
    const normalized = toPosixRel(vaultDir, full0)
    if (!isMarkdownFile(normalized)) {
      return { ok: false, reason: mainT().wikiMain.editMdOnly }
    }
    const lock = vaultActivity.editLock(vaultDir)
    if (lock) return { ok: false, reason: lock }
    if (existsSync(join(vaultDir, INGEST_LOCK))) {
      return { ok: false, reason: mainT().mainErrors.ingestBusyThen(mainT().mainErrors.thenSave) }
    }
    const repo = existsSync(join(vaultDir, '.git'))
    // generic 폴더(읽기 중심)는 git 줄기 상태를 따지지 않는다 — 커밋을 만들지 않으므로
    // 기본 브랜치·작업 브랜치·병합 대기가 저장과 무관하다. hash 검사(아래)는 그대로 둔다
    const generic = vaultKindOf(vaultDir) === 'generic'
    if (repo && !generic) {
      if (!defaultBranchOf(vaultDir))
        return { ok: false, reason: mainT().mainErrors.noDefaultBranch }
      const current = git(vaultDir, ['branch', '--show-current']).trim()
      if (current === '' || isWorkBranch(current)) {
        return { ok: false, reason: notOnDefaultReason(current, mainT().mainErrors.thenSave) }
      }
      // 파일을 쓰기 전에 본다 — 써 놓고 커밋이 실패하면 충돌 표식째 고르기가 끝난 것으로 남는다
      const blocked = commitBlockedReason(vaultDir, mainT().mainErrors.thenSave)
      if (blocked) return { ok: false, reason: blocked }
    }
    if (!existsSync(full0)) return { ok: false, reason: mainT().wikiMain.fileGone }
    const disk = readFileSync(full0, 'utf8')
    const baseCommit = repo && !generic ? git(vaultDir, ['rev-parse', 'HEAD']).trim() : null
    if (createHash('sha256').update(disk).digest('hex') !== baseHash) {
      return { ok: false, reason: mainT().wikiMain.fileChanged }
    }
    if (disk === text) return { ok: true, commit: null, baseCommit }
    // 무시 여부를 먼저 본다 — 써 놓고 판정이 실패하면 "저장 못 함" 인데 디스크는 바뀐 상태가 된다.
    // generic 폴더는 남의 git 기록에 앱 명의 커밋을 남기지 않는다 — 파일만 저장한다
    const commitless = !repo || generic || ignoredByGit(vaultDir, normalized)
    writeFileSync(full0, text, 'utf8')
    if (commitless) return { ok: true, commit: null, baseCommit }
    const slug = normalized.replace(/\.md$/i, '').split('/').pop() ?? 'page'
    // 붙여넣은 그림은 그것을 건 글과 한 커밋에 탄다 — 글만 올라가면 팀 쪽에서 그림이 깨진다
    const paths = [
      normalized,
      ...referencedAttachments(vaultDir, text).filter((rel) => !ignoredByGit(vaultDir, rel))
    ]
    const commitArgs = [
      '--literal-pathspecs',
      ...appIdentity(),
      'commit',
      '-m',
      `edit: ${slug}`,
      '--',
      ...paths
    ]
    git(vaultDir, ['--literal-pathspecs', 'add', '--', ...paths])
    git(vaultDir, commitArgs)
    return { ok: true, commit: git(vaultDir, ['rev-parse', 'HEAD']).trim(), baseCommit }
  },

  /**
   * 글·코드 파일 편집 저장 — `write` 와 같은 확인(잠금·줄기·hash·no-op·커밋)을 탄다.
   * md 는 `write` 길로만 간다(앞머리·첨부 흐름이 다르다). slug 는 확장자를 뗀 파일 이름.
   * 거절 순서: 경로 → 종류 → 잠금 → HEAD 브랜치 → 파일 없음 → hash 불일치.
   */
  writeText(vaultDir: string, rel: string, text: string, baseHash: string): WriteResult {
    const full0 = resolveInVault(vaultDir, rel)
    if (full0 === null) return { ok: false, reason: mainT().mainErrors.badPath }
    const normalized = toPosixRel(vaultDir, full0)
    const kind = fileKind(normalized)
    if (kind !== 'text' && kind !== 'code') {
      return { ok: false, reason: mainT().wikiMain.textOnly }
    }
    const lock = vaultActivity.editLock(vaultDir)
    if (lock) return { ok: false, reason: lock }
    if (existsSync(join(vaultDir, INGEST_LOCK))) {
      return { ok: false, reason: mainT().mainErrors.ingestBusyThen(mainT().mainErrors.thenSave) }
    }
    const repo = existsSync(join(vaultDir, '.git'))
    const generic = vaultKindOf(vaultDir) === 'generic'
    if (repo && !generic) {
      if (!defaultBranchOf(vaultDir))
        return { ok: false, reason: mainT().mainErrors.noDefaultBranch }
      const current = git(vaultDir, ['branch', '--show-current']).trim()
      if (current === '' || isWorkBranch(current)) {
        return { ok: false, reason: notOnDefaultReason(current, mainT().mainErrors.thenSave) }
      }
      const blocked = commitBlockedReason(vaultDir, mainT().mainErrors.thenSave)
      if (blocked) return { ok: false, reason: blocked }
    }
    if (!existsSync(full0)) return { ok: false, reason: mainT().wikiMain.fileGone }
    const disk = readFileSync(full0, 'utf8')
    const baseCommit = repo && !generic ? git(vaultDir, ['rev-parse', 'HEAD']).trim() : null
    if (createHash('sha256').update(disk).digest('hex') !== baseHash) {
      return { ok: false, reason: mainT().wikiMain.fileChanged }
    }
    if (disk === text) return { ok: true, commit: null, baseCommit }
    const commitless = !repo || generic || ignoredByGit(vaultDir, normalized)
    writeFileSync(full0, text, 'utf8')
    if (commitless) return { ok: true, commit: null, baseCommit }
    const slug =
      normalized
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '') ?? 'note'
    git(vaultDir, ['--literal-pathspecs', 'add', '--', normalized])
    git(vaultDir, [
      '--literal-pathspecs',
      ...appIdentity(),
      'commit',
      '-m',
      `edit: ${slug}`,
      '--',
      normalized
    ])
    return { ok: true, commit: git(vaultDir, ['rev-parse', 'HEAD']).trim(), baseCommit }
  }
}
