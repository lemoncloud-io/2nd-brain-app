// 채팅 입력칸의 `/` 스킬과 `@` 문서 고르기 — 무엇을 친 중인지 읽는 순수 함수. 고른 스킬은 `/이름` 으로 시작하는 질문이 된다.
import type { ChatSkill } from '../../../shared/ipc-contract'

/** 입력이 `/이름` 까지만 쳐진 상태면 그 이름 조각 — 메뉴를 띄운다. 띄어쓰기를 쳤으면 null */
export const slashQuery = (draft: string): string | null => {
  const m = /^\/(\S*)$/.exec(draft)
  return m ? (m[1] ?? '') : null
}

const byName = (a: ChatSkill, b: ChatSkill): number => a.name.localeCompare(b.name)

/**
 * 친 조각으로 스킬을 고른다 — 이름이 그 조각으로 시작하는 것 먼저, 그다음 이름·설명 어딘가에 든 것.
 * 두 무리 안은 이름순
 */
export const matchSkills = (skills: ChatSkill[], query: string): ChatSkill[] => {
  const q = query.toLowerCase()
  const sorted = [...skills].sort(byName)
  const head = sorted.filter((s) => s.name.toLowerCase().startsWith(q))
  const rest = sorted.filter(
    (s) =>
      !head.includes(s) &&
      (s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q))
  )
  return [...head, ...rest]
}

/**
 * 커서 앞에서 치는 중인 `@조각` — 줄 처음이나 띄어쓰기 뒤의 `@` 부터 커서까지, 사이에 띄어쓰기가 없어야 한다.
 * 메일 주소(`a@b`)는 `@` 앞이 글자라 잡지 않는다
 */
export const mentionQuery = (
  draft: string,
  caret: number
): { start: number; query: string } | null => {
  const before = draft.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && !/\s/.test(before[at - 1] ?? '')) return null
  const query = before.slice(at + 1)
  if (/\s/.test(query)) return null
  return { start: at, query }
}
