// 아무 위키 페이지나 고르기 — 잊고 있던 페이지를 다시 만나는 명령(Obsidian Random note). 순수.
import { LINT_EXEMPT } from '../../../shared/wiki/lint'

/** 지금 페이지와 구조 페이지(INDEX·TOPIC_MAP·VAULT_MEMORY — 다시 읽을 글이 아니다)를 뺀 위키 페이지 하나 — 고를 것이 없으면 null. `roll` 은 [0, 1) */
export const randomPage = (
  rels: string[],
  current: string | null,
  roll: () => number = Math.random
): string | null => {
  const pool = rels.filter((rel) => rel !== current && !LINT_EXEMPT.includes(rel))
  if (pool.length === 0) return null
  return pool[Math.floor(roll() * pool.length)] ?? null
}
