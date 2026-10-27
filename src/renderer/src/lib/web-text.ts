// 웹 탭 화면 말 — 툴바·빈 자리 문구는 사전(`t.web`), 여기는 판정이 고르는 문장만.
import type { WebError } from '../../../shared/ipc-contract'
import type { WebAddress } from '../../../shared/web-address'
import { getT } from './i18n'
import type { UserError } from './user-error'

/** 주소칸 — ⌘L 이 페이지 초점에서도 여기로 온다(use-web-events) */
export const WEB_ADDRESS_ID = 'web-address'

/** 주소칸 판정이 거절한 까닭 — 해요체 한 문장 */
export const addressProblem = (result: Extract<WebAddress, { ok: false }>): string | null => {
  if (result.reason === 'empty') return null
  if (result.reason === 'scheme') return getT().web.badScheme
  return getT().web.badAddress
}

/** 페이지가 안 뜬 까닭 — 문장은 할 일을, 원문(엔진 오류·주소)은 "자세히" 에 */
export const webErrorText = (error: WebError, url: string): UserError =>
  error.kind === 'crashed'
    ? { text: getT().web.crashed, detail: url || null }
    : {
        text: getT().web.loadFailed,
        detail: `${error.description} (${error.code})${url ? `\n${url}` : ''}`
      }
