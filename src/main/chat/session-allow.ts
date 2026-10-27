// "이 대화에서 계속 허용" 의 범위 — 셸은 명령 단위, 그 밖의 도구는 도구 단위로 기억한다.
// 셸을 도구 단위로 기억하면 `ls` 하나를 허용한 뒤 파일을 지우는 명령까지 묻지 않고 돈다.
import { isShellTool } from '../../shared/chat-permission'

/** pattern = null 이면 그 도구 전체. 셸은 CLI 가 제안한 규칙(`git status *` 꼴) 또는 그 명령 그대로 */
export type SessionRule = { tool: string; pattern: string | null }

/** 연결·치환·리다이렉트 기호 — 앞부분이 같아도 뒤에 다른 명령을 붙일 수 있다 */
const CHAINED = /[;&|`$<>(){}\n]/

/** 승인 카드에서 "계속 허용" 을 눌렀을 때 기억할 규칙 — `suggested` 는 CLI 승인 요청의 permission_suggestions */
export const sessionRuleOf = (
  tool: string,
  target: string,
  suggested: string | undefined
): SessionRule =>
  isShellTool(tool) ? { tool, pattern: suggested ?? target } : { tool, pattern: null }

/** 기억한 규칙이 이 요청을 허용하나 — 같은 명령 그대로는 허용, 연결 기호가 든 다른 명령은 다시 묻는다 */
export const sessionAllows = (rule: SessionRule, tool: string, target: string): boolean => {
  if (rule.tool !== tool) return false
  const { pattern } = rule
  if (pattern === null || target === pattern) return true
  if (CHAINED.test(target)) return false
  if (pattern.endsWith(' *')) {
    const head = pattern.slice(0, -2)
    return target === head || target.startsWith(`${head} `)
  }
  if (pattern.endsWith('*')) return target.startsWith(pattern.slice(0, -1))
  return false
}
