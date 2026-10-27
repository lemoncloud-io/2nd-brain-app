// 위키화를 기다리는 자료 — `Clippings/` 바로 아래 항목. main 이 세는 규칙(`journey.ts`·`pendingClippings`)과 같다:
// 숨김 파일은 빼고(트리가 이미 뺀다) 폴더도 한 항목으로 센다. 수만 말하면 무엇이 들어갈지 몰라 누르지 못한다.
import type { VaultTreeEntry } from '../../../shared/ipc-contract'
import { treeLabel } from './tree-model'

export type Clipping = { rel: string; name: string; tag: string | null; mtimeMs: number }

const INBOX = 'Clippings/'

/** 최근에 넣은 것부터 — 방금 넣은 자료를 찾으러 온 사람이 맨 위에서 본다 */
export const waitingClippings = (tree: VaultTreeEntry[]): Clipping[] =>
  tree
    .filter((entry) => entry.rel.startsWith(INBOX) && !entry.rel.slice(INBOX.length).includes('/'))
    .map((entry) => ({ rel: entry.rel, ...treeLabel(entry), mtimeMs: entry.mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
