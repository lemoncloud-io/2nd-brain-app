import { describe, expect, it } from 'vitest'
import { updateLine } from './update-text'

describe('updateLine', () => {
  it('꺼진 앱은 버전과 "팀이 전해 준다" 한 줄뿐이다', () => {
    expect(updateLine({ kind: 'off' }, '0.1.0')).toEqual({
      text: '지금 버전 0.1.0 · 새 버전은 팀에서 보내 드려요',
      tone: 'idle',
      action: null,
      detail: null
    })
  })

  it('첫 확인 전에는 최신이라고 말하지 않는다', () => {
    expect(updateLine({ kind: 'idle' }, '0.1.0').text).toBe('지금 버전 0.1.0')
    expect(updateLine({ kind: 'latest' }, '0.1.0').text).toBe('지금 버전 0.1.0 · 최신 버전이에요')
  })

  it('버전을 못 읽어도 상태 줄은 선다', () => {
    expect(updateLine({ kind: 'off' }, null).text).toBe('지금 버전 · 새 버전은 팀에서 보내 드려요')
  })

  it('받는 중에는 새 버전과 진행률을 보인다', () => {
    expect(updateLine({ kind: 'downloading', version: '0.2.0', percent: 42 }, '0.1.0').text).toBe(
      '새 버전 0.2.0 받는 중 · 42%'
    )
  })

  it('받아 두었으면 다시 시작 버튼을 켠다', () => {
    const line = updateLine({ kind: 'ready', version: '0.2.0' }, '0.1.0')
    expect(line.action).toBe('restart')
    expect(line.text).toContain('0.2.0 준비됨')
  })

  it('확인 실패는 "다시 확인" 을 할 일로 주고 원문은 접는다', () => {
    const line = updateLine(
      { kind: 'failed', during: 'check', detail: 'net::ERR_INTERNET_DISCONNECTED' },
      '0.1.0'
    )
    expect(line.tone).toBe('warn')
    expect(line.action).toBe('check')
    expect(line.detail).toBe('net::ERR_INTERNET_DISCONNECTED')
    expect(line.text).not.toContain('net::')
  })

  it('설치 실패는 확인 실패와 다른 말을 하고, 할 일은 다시 시작 재시도다', () => {
    const line = updateLine({ kind: 'failed', during: 'install', detail: 'EACCES' }, '0.1.0')
    expect(line.text).toContain('새 버전으로 바꾸지 못했어요')
    expect(line.action).toBe('restart')
    expect(line.detail).toBe('EACCES')
  })

  it('배포 말을 화면에 내지 않는다', () => {
    const states = [
      { kind: 'off' },
      { kind: 'idle' },
      { kind: 'checking' },
      { kind: 'latest' },
      { kind: 'downloading', version: '0.2.0', percent: 1 },
      { kind: 'ready', version: '0.2.0' },
      { kind: 'failed', during: 'check', detail: 'x' },
      { kind: 'failed', during: 'install', detail: 'x' }
    ] as const
    for (const state of states) {
      expect(updateLine(state, '0.1.0').text).not.toMatch(/릴리스|release|서버|feed|draft/i)
    }
  })
})
