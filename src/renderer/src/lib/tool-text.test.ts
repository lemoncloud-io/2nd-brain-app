import { describe, expect, it } from 'vitest'
import { isMcpTool, sessionAllowLabel, toolActivity } from './tool-text'

describe('tool-text — test: tool-text.ts', () => {
  it('엔진 기록 라벨을 재사용한다', () => {
    expect(toolActivity('WebFetch', 'https://example.com')).toContain('웹 페이지를 읽어요')
    expect(toolActivity('Bash', 'date')).toContain('명령을 실행해요')
  })

  it('mcp__서버__도구는 연결 도구로 묶는다', () => {
    expect(isMcpTool('mcp__github__get_issue')).toBe(true)
    expect(toolActivity('mcp__github__get_issue', '')).toContain('연결 도구')
  })

  it('모르는 도구는 영어 이름 대신 한 일을 말한다', () => {
    expect(toolActivity('SuperTool', 'x')).toContain('AI 도구')
  })

  it('셸의 "계속 허용" 은 그 명령만이라고 단추가 말한다', () => {
    expect(sessionAllowLabel('Bash')).toBe('이 명령은 이 대화에서 계속 허용')
    expect(sessionAllowLabel('WebFetch')).toBe('이 대화에서 계속 허용')
  })
})
