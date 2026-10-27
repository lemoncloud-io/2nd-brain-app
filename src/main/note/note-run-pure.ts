// 채팅 노트 판정의 순수 함수 — 디스크·git 없이 문자열·목록만 본다.
import { createHash } from 'node:crypto'
import type { ChatMessage } from '../../shared/ipc-contract'
import type { Sig } from './run-store'

export const sha256 = (data: Buffer | string): string =>
  createHash('sha256').update(data).digest('hex')

export const sameSig = (a: Sig | null, b: Sig | null): boolean =>
  a === null || b === null ? a === b : a.size === b.size && a.mtimeMs === b.mtimeMs

/** `-z` porcelain — "XY path\0" 줄. 이름 바꾸기는 끈 채로 부른다 */
export const parseStatus = (out: string): Map<string, string> => {
  const map = new Map<string, string>()
  for (const line of out.split('\0')) {
    if (line.length > 3) map.set(line.slice(3), line.slice(0, 2))
  }
  return map
}

export const untrackedCode = (code: string): boolean => code === '??' || code === '!!'

/** 중첩 저장소처럼 git 이 폴더째 알리는 항목 — 파일 단위로 판정하지 않는다 */
export const isDirEntry = (rel: string): boolean => rel.endsWith('/')

export const isIgnoreFile = (rel: string): boolean => rel.split('/').pop() === '.gitignore'

/** 커밋 제목의 이름 — 볼트에 남는 기록이라 화면 언어를 따르지 않는다(D8) */
// ui-hangul-ignore: 볼트 커밋 메시지(D8)
export const slugOf = (rels: string[]): string => {
  const first = (rels[0] ?? 'note').split('/').pop()!.replace(/\.md$/i, '')
  return rels.length > 1 ? `${first} 외 ${rels.length - 1}` : first
}

export const pushOnce = (lines: string[], line: string): void => {
  if (!lines.includes(line)) lines.push(line)
}

/**
 * 되돌릴 기록이 지워진 카드를 표시한다 — 누르기 전에 "되돌릴 기록이 지워졌다" 를 보인다.
 * `has` 는 `NoteRuns.has` 를 그 보관함에 묶은 것
 */
export const markPruned = (
  messages: ChatMessage[],
  has: (changeId: string) => boolean
): ChatMessage[] =>
  messages.map((m) =>
    m.changes && !m.changes.undone && m.changes.files.length > 0 && !has(m.changes.id)
      ? { ...m, changes: { ...m.changes, pruned: true } }
      : m
  )
