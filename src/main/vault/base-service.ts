// `.base` 표 읽기 — 보관함 md 의 frontmatter 를 모아 뷰별 표로 만든다(읽기 전용).
// Obsidian 은 보관함 전체를 보므로 `DOC_ROOTS` 로 좁히지 않는다 — 무엇을 뺄지는 그 파일의 filters 가 정한다.
import { readFile } from 'node:fs/promises'
import { parseWikiPage } from '../../shared/wiki/parse'
import { pageTags } from '../../shared/wiki/tags'
import { evaluateBase, type BaseNote, type BaseTable } from '../../shared/bases/evaluate'
import { vaultTree } from './vault-scope'
import { resolveInVault } from './vault-path'
import { mainT } from '../i18n'

/** 한 번에 읽는 노트 수 — 지금 가장 큰 보관함(1809장)의 열 배다. 캐시가 있어 다시 열 때는 안 읽는다.
 *  넘으면 앞에서부터 자르고 그 사실을 화면에 말한다 */
const NOTE_LIMIT = 20000

/** frontmatter 캐시 — rel 별 마지막 mtime·크기의 결과. 표를 다시 열 때 파일을 다시 읽지 않는다
 *  (시각과 크기를 같이 봐서 watcher 없이도 안전 — mtime 을 보존하며 내용을 바꾸는 복사 도구가 있다).
 *  `wiki-service` 의 페이지 캐시와 같은 방식이다 */
const noteCache = new Map<string, { mtimeMs: number; size: number; note: BaseNote }>()

const noteOf = async (
  vaultDir: string,
  rel: string,
  mtimeMs: number,
  size: number
): Promise<BaseNote | null> => {
  const key = `${vaultDir}\u0000${rel}`
  const cached = noteCache.get(key)
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) return cached.note

  const full = resolveInVault(vaultDir, rel)
  if (full === null) return null
  let text: string
  try {
    text = await readFile(full, 'utf8')
  } catch {
    return null
  }
  const base = rel.slice(rel.lastIndexOf('/') + 1)
  const parsed = parseWikiPage(rel, text)
  // hasTag·file.tags 입력 — 속성 tags와 본문 #태그의 합집합(사이드바와 같은 집합)
  const frontmatter = parsed.frontmatter ?? {}
  const note: BaseNote = {
    rel,
    basename: base.replace(/\.md$/i, ''),
    folder: rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '',
    props: { ...frontmatter, tags: pageTags(parsed) },
    mtimeMs,
    size
  }
  noteCache.set(key, { mtimeMs, size, note })
  return note
}

/** `.base` 파일 하나를 표로. 파일을 못 읽으면 `error` 만 담아 돌려준다 */
export const readBase = async (vaultDir: string, rel: string): Promise<BaseTable> => {
  const full = resolveInVault(vaultDir, rel)
  if (full === null || !rel.toLowerCase().endsWith('.base')) {
    return { views: [], error: mainT().vaultMain.baseInvalid }
  }
  let text: string
  try {
    text = await readFile(full, 'utf8')
  } catch {
    return { views: [], error: mainT().vaultMain.baseMissing }
  }

  const docs = (await vaultTree(vaultDir))
    .filter((entry) => entry.kind === 'file' && entry.ext === '.md')
    .sort((a, b) => a.rel.localeCompare(b.rel))
  const read = await Promise.all(
    docs.slice(0, NOTE_LIMIT).map((entry) => noteOf(vaultDir, entry.rel, entry.mtimeMs, entry.size))
  )
  const notes = read.filter((note): note is BaseNote => note !== null)

  const table = evaluateBase(text, notes)
  return docs.length > NOTE_LIMIT
    ? { ...table, truncated: { seen: notes.length, total: docs.length } }
    : table
}
