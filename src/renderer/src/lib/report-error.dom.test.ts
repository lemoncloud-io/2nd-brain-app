// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reportError, reportRenderError } from './report-error'

const sent = vi.fn<(report: unknown) => Promise<void>>(() => Promise.resolve())

beforeEach(() => {
  sent.mockClear()
  ;(window as unknown as { api: unknown }).api = { reportError: sent }
})

describe('reportError', () => {
  it('같은 오류는 다섯 번까지만 보낸다 — 다른 오류는 따로 센다', () => {
    for (let i = 0; i < 8; i += 1) reportError({ level: 'error', message: 'loop' })
    reportError({ level: 'error', message: 'other' })
    expect(sent).toHaveBeenCalledTimes(6)
  })

  it('감싼 오류의 원인을 stack 뒤에 잇는다', () => {
    const root = new Error('disk full')
    reportRenderError(new Error('save failed', { cause: root }), '    at Editor')
    const report = sent.mock.calls[0][0] as { message: string; stack: string }
    expect(report.message).toBe('render: Error: save failed')
    expect(report.stack).toContain('caused by: Error: disk full')
    expect(report.stack).toContain('at Editor')
  })
})
