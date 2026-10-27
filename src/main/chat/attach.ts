// 채팅에 붙이는 문서 — `@` 로 고른 문서의 본문을 읽어 프롬프트에 싣는다.
// 경로는 renderer 에서 오므로 보관함 안 파일인지 다시 확인하고, 글 파일만 읽는다. 예산은 글자 수로 —
// 한 문서가 칸을 다 먹지 않게 문서마다 상한을 두고, 넘치면 앞부분만 싣고 잘렸다고 적는다.
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import type { Attached } from './prompts'
import { vaultFileOrNull } from '../vault/vault-scope'
import { resolveInVault } from '../vault/vault-path'

const TEXT_EXT = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.base',
  '.canvas',
  '.json',
  '.csv',
  '.yaml',
  '.yml'
])
/** 한 질문에 붙일 수 있는 `@` 문서 수 */
export const MAX_MENTIONS = 8
const PER_DOC = 24_000
const TOTAL = 60_000
/** 이보다 큰 파일은 열지 않는다 — 앞부분만 쓰더라도 통째로 읽게 된다 */
const MAX_BYTES = 2_000_000

export const readAttached = async (
  vaultDir: string,
  mentions: unknown,
  limits: { perDoc: number; total: number } = { perDoc: PER_DOC, total: TOTAL }
): Promise<Attached[]> => {
  const picked = Array.isArray(mentions) ? mentions.slice(0, MAX_MENTIONS) : []
  const wanted: string[] = []
  for (const raw of picked) {
    const rel = vaultFileOrNull(vaultDir, raw)
    if (rel === null || wanted.includes(rel) || !TEXT_EXT.has(extname(rel).toLowerCase())) continue
    wanted.push(rel)
  }

  const out: Attached[] = []
  let left = limits.total
  for (const rel of wanted) {
    if (left <= 0) break
    const full = resolveInVault(vaultDir, rel)
    if (full === null) continue
    try {
      if ((await stat(full)).size > MAX_BYTES) continue
      const text = await readFile(full, 'utf8')
      const cap = Math.min(limits.perDoc, left)
      const truncated = text.length > cap
      out.push({ rel, text: truncated ? text.slice(0, cap) : text, truncated })
      left -= Math.min(text.length, cap)
    } catch {
      // 지워졌거나 읽을 수 없는 파일 — 붙이지 않고 질문은 그대로 보낸다
    }
  }
  return out
}
