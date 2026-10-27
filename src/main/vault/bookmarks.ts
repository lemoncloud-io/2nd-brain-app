// 북마크 — Obsidian 과 같은 파일(`.obsidian/bookmarks.json`)에 둔다. 앱에서 단 별은 Obsidian 에서도 보이고
// 그 반대도 된다. 우리는 파일 항목(`type: file`)만 읽고 쓰며, 검색·폴더·그룹 같은 다른 항목은 건드리지 않는다.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mainT } from '../i18n'

const FILE = join('.obsidian', 'bookmarks.json')

interface Item {
  type: string
  path?: string
  title?: string
  ctime?: number
  items?: Item[]
}

const read = (vaultDir: string): { items: Item[] } & Record<string, unknown> => {
  const full = join(vaultDir, FILE)
  if (!existsSync(full)) return { items: [] }
  try {
    const parsed = JSON.parse(readFileSync(full, 'utf8')) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { items?: unknown }).items)
    ) {
      return parsed as { items: Item[] }
    }
  } catch {
    // 깨진 파일 — 목록은 비어 보이고, 쓸 때 덮지 않도록 아래 write 가 막는다
  }
  return { items: [], broken: true }
}

/** 그룹 안까지 훑은 파일 북마크의 경로 — 단 순서대로 */
const filePaths = (items: Item[]): string[] =>
  items.flatMap((item) =>
    item.type === 'file' && typeof item.path === 'string'
      ? [item.path]
      : item.type === 'group' && Array.isArray(item.items)
        ? filePaths(item.items)
        : []
  )

export const listBookmarks = (vaultDir: string): string[] => filePaths(read(vaultDir).items)

export type BookmarkResult = { ok: true; bookmarks: string[] } | { ok: false; reason: string }

/** 없으면 맨 뒤에 달고, 있으면 뗀다(그룹 안의 것도) */
export const toggleBookmark = (vaultDir: string, rel: string, now = Date.now()): BookmarkResult => {
  const data = read(vaultDir)
  if (data['broken']) {
    return {
      ok: false,
      reason: mainT().vaultMain.bookmarksUnreadable
    }
  }
  const drop = (items: Item[]): { items: Item[]; hit: boolean } => {
    let hit = false
    const kept = items.flatMap((item) => {
      if (item.type === 'file' && item.path === rel) {
        hit = true
        return []
      }
      if (item.type === 'group' && Array.isArray(item.items)) {
        const inner = drop(item.items)
        hit ||= inner.hit
        return [{ ...item, items: inner.items }]
      }
      return [item]
    })
    return { items: kept, hit }
  }
  const dropped = drop(data.items)
  const items = dropped.hit
    ? dropped.items
    : [...data.items, { type: 'file', ctime: now, path: rel }]
  const dir = join(vaultDir, '.obsidian')
  mkdirSync(dir, { recursive: true })
  // 반쯤 쓴 파일을 Obsidian 이 읽지 않게 옆에 쓰고 바꿔 끼운다
  const tmp = join(dir, `bookmarks.json.${process.pid}.tmp`)
  writeFileSync(tmp, `${JSON.stringify({ ...data, items }, null, 2)}\n`)
  renameSync(tmp, join(vaultDir, FILE))
  return { ok: true, bookmarks: filePaths(items) }
}
