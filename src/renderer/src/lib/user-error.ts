// 화면에 오류를 내는 단일 통로. main 이 던진 Error 는 Electron 이 한 번 감싸서 오고, 그 안에는
// 사용자가 할 일이 없는 문구(스택·errno·채널 이름)가 섞여 있다. 여기서 "무엇이 안 됐나 + 무엇을 하나"
// 한 문장으로 바꾸고, 원문은 접어 둔 채 들고 간다 — 원문을 지우면 사용자가 도움을 청할 때 줄 게 없다.

import {
  classifyEngineFailure,
  describeEngineFailure,
  DETAIL_MARK
} from '../../../shared/engine-failure'
import { noteEngineFailure } from './engine-limit'
import { getT } from './i18n'

/** Electron 이 IPC 거절에 씌우는 껍질 — `Error invoking remote method 'x': Error: <본문>` */
const IPC_WRAPPER = /^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/
const LEADING_ERROR = /^Error:\s*/

export interface UserError {
  /** 사용자가 읽을 한 문장 */
  text: string
  /** "자세히" 뒤에 둘 원문. 문장과 같으면 null */
  detail: string | null
}

const raw = (error: unknown): string => {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(IPC_WRAPPER, '').replace(LEADING_ERROR, '').trim()
}

/**
 * main 이 칸막이(DETAIL_MARK)로 "사용자 문장 + 원문" 을 실어 보낸 것 — 앞은 그대로 쓰고 뒤는 접는다.
 * 칸막이가 없으면 아무 일도 하지 않는다: 줄바꿈으로 가르면 스택의 첫 줄이 문장으로 오해된다.
 */
const split = (detail: string): { text: string; detail: string | null } | null => {
  const at = detail.indexOf(DETAIL_MARK)
  if (at === -1) return null
  const head = detail.slice(0, at).trim()
  const rest = detail.slice(at + DETAIL_MARK.length).trim()
  if (head === '') return null
  return { text: head, detail: rest === head ? null : rest || null }
}

/** 원문에서 알아볼 수 있는 원인 → 사용자가 할 일. 못 알아보면 null */
const cause = (detail: string): string | null => {
  // AI 실패(한도·너무 긴 내용·혼잡)는 판정이 한 곳에 있다 — 파일 오류보다 먼저 본다
  const kind = classifyEngineFailure(detail)
  if (kind !== 'unknown' && kind !== 'offline') return describeEngineFailure(detail)
  if (/ENOENT|no such file or directory/i.test(detail)) {
    return getT().errors.notFound
  }
  if (/EACCES|EPERM|permission denied|operation not permitted/i.test(detail)) {
    return getT().errors.noPermission
  }
  if (/ENOSPC|no space left/i.test(detail)) return getT().errors.diskFull
  if (/EBUSY|resource busy|locked/i.test(detail)) {
    return getT().errors.busy
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|fetch failed/i.test(detail)) {
    return getT().errors.offline
  }
  return null
}

/**
 * `what` 은 안 된 일을 사용자 말로 적은 것("승인 목록을 읽지 못했다").
 * 아는 원인이면 할 일을 덧붙이고, 모르면 원문을 접어 둔 채 `what` 만 보여 준다.
 */
export const toUserError = (error: unknown, what: string): UserError => {
  const detail = raw(error)
  // 한도는 화면 하나의 사건이 아니라 계정의 상태다 — 지나가는 길에 앱이 기억해 둔다
  noteEngineFailure(detail)
  const layered = split(detail)
  if (layered) return layered
  const known = cause(detail)
  if (known) return { text: `${what} — ${known}`, detail: detail || null }
  // main 이 이미 사용자 말로 쓴 짧은 문구면 그게 가장 정확하다
  if (detail && detail.length <= 80 && !/[{}]|\bat \w+ \(/.test(detail)) {
    return { text: `${what} — ${detail}`, detail: null }
  }
  return { text: what, detail: detail || null }
}
