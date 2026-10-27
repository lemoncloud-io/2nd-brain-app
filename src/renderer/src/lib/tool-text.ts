// 채팅 도구 말 — 엔진 도구 이름을 사람이 읽는 한 줄로 바꾼다.
// 라벨은 `engine-log.ts` 의 기록을 재사용한다 — 같은 도구가 위키화 기록과 채팅에서 다르게 말하면 안 된다.
import { isShellTool } from '../../../shared/chat-permission'
import { describeEvents } from './engine-log'
import { getT } from './i18n'

/** `mcp__서버__도구` 꼴 — 서버 연결로 쓰는 도구. 이름이 길고 서버마다 달라 묶어서 말한다 */
export const isMcpTool = (name: string): boolean =>
  name.startsWith('mcp__') || name.startsWith('mcp_')

/** 답이 오는 동안 보이는 진행 한 줄 — "웹 페이지를 읽어요 — example.com" 꼴 */
export const toolActivity = (name: string, target: string): string => {
  const t = getT().tools
  if (isMcpTool(name)) return target ? `${t.mcp} — ${target}` : t.mcp
  const [line] = describeEvents([{ type: 'tool', name, target }], null)
  if (line?.kind === 'step') return line.detail ? `${line.label} — ${line.detail}` : line.label
  return target ? `${t.ai} — ${target}` : t.ai
}

/** "계속 허용" 단추 — 셸은 그 명령만 기억한다(main `session-allow.ts`). 범위를 단추가 말한다 */
export const sessionAllowLabel = (tool: string): string =>
  isShellTool(tool) ? getT().tools.allowCommand : getT().tools.allowTool
