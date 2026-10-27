import { describe, expect, it } from 'vitest'
import { classifyEngineFailure, describeEngineFailure, limitResetAt } from './engine-failure'

describe('엔진 실패 가려내기', () => {
  it('실제로 보는 문구들을 종류로 가른다', () => {
    expect(classifyEngineFailure('Claude AI usage limit reached|1758067200')).toBe('usage-limit')
    expect(classifyEngineFailure('429 Too Many Requests')).toBe('usage-limit')
    expect(classifyEngineFailure('prompt is too long: 250000 tokens')).toBe('context-too-long')
    expect(classifyEngineFailure('overloaded_error')).toBe('overloaded')
    expect(classifyEngineFailure('세션을 찾을 수 없다')).toBe('session-expired')
    expect(classifyEngineFailure('그냥 깨졌다')).toBe('unknown')
  })

  // 사라진 세션의 사유에는 세션 id(uuid)가 실린다 — id 속 숫자가 한도·붐빔 코드로 읽히면 새 세션 재시도가 빠진다
  it('세션 id 속 숫자는 상태 코드로 읽지 않는다', () => {
    for (const id of [
      '5f1e2d3c-4290-4abc-8def-0123456789ab',
      'a503b2c1-0000-4000-8000-502000000000'
    ]) {
      expect(classifyEngineFailure(`No conversation found with session ID: ${id}`)).toBe(
        'session-expired'
      )
    }
    expect(classifyEngineFailure('HTTP 503 from upstream')).toBe('overloaded')
    // codex-cli 0.163.0 app-server 실측: 없는 thread 의 resume
    expect(
      classifyEngineFailure('no rollout found for thread id 00000000-0000-4000-8000-000000000000')
    ).toBe('session-expired')
  })

  it('해제 시각을 읽어 문장에 넣는다', () => {
    const at = limitResetAt('Claude AI usage limit reached|1758067200')
    expect(at?.getTime()).toBe(1758067200 * 1000)
    expect(describeEngineFailure('Claude AI usage limit reached|1758067200')).toMatch(
      /한도에 닿았어요\. \d+시/
    )
    expect(limitResetAt('usage limit reached')).toBeNull()
    expect(describeEngineFailure('usage limit reached')).toContain('잠시 뒤 다시 쓸 수 있어요')
  })

  it('안 된 일을 앞에 붙여 한 문장으로 만든다', () => {
    expect(describeEngineFailure('overloaded_error', '위키화를 마치지 못했어요')).toBe(
      '위키화를 마치지 못했어요 — AI가 지금 붐벼요. 잠시 뒤 다시 시도해 주세요'
    )
    // 모르는 실패면 안 된 일만 말하고 원문은 부르는 쪽이 접어 둔다
    expect(describeEngineFailure('zzz', '위키화를 마치지 못했어요')).toBe(
      '위키화를 마치지 못했어요'
    )
  })

  it('끊긴 네트워크를 offline 으로 가린다', () => {
    expect(classifyEngineFailure('fetch failed: getaddrinfo ENOTFOUND api.anthropic.com')).toBe(
      'offline'
    )
    expect(classifyEngineFailure('connect ECONNREFUSED 1.2.3.4:443')).toBe('offline')
    expect(classifyEngineFailure('socket ETIMEDOUT')).toBe('offline')
    expect(describeEngineFailure('fetch failed: getaddrinfo ENOTFOUND x')).toBe(
      '인터넷에 연결하지 못했어요. 연결을 확인하고 다시 시도해 주세요'
    )
    expect(describeEngineFailure('ECONNREFUSED', '위키화를 마치지 못했어요')).toBe(
      '위키화를 마치지 못했어요 — 인터넷에 연결하지 못했어요. 연결을 확인하고 다시 시도해 주세요'
    )
  })

  it('문장 세 종류를 있는 그대로 말한다', () => {
    expect(describeEngineFailure('prompt is too long: 250000 tokens')).toBe(
      '한 번에 다루기엔 내용이 너무 많아요. 새 대화로 나눠 묻거나 자료를 나눠 넣어 주세요'
    )
    expect(describeEngineFailure('session not found (--resume)')).toBe(
      '이전 대화를 이어가지 못했어요'
    )
    expect(describeEngineFailure('zzz')).toBe('AI를 실행하지 못했어요')
  })

  it('해제 시각 밀리초·정각 분을 읽는다', () => {
    // 13자리 밀리초 그대로, 10자리 초는 ×1000
    expect(limitResetAt('usage limit|1758067200000')?.getTime()).toBe(1758067200000)
    // 정각이면 분을 붙이지 않는다 — 로컬 정각으로 만든다(UTC 정각은 :30/:45 오프셋 지역에서 빗나감)
    const sharpDate = new Date()
    sharpDate.setMinutes(0, 0, 0)
    const sharp = Math.floor(sharpDate.getTime() / 1000)
    const sharpText = describeEngineFailure(`usage limit|${sharp}`)
    expect(sharpText).toMatch(/한도에 닿았어요\. \d+시쯤/)
    expect(sharpText).not.toContain('분')
    const halfText = describeEngineFailure(`usage limit|${sharp * 1000 + 30 * 60 * 1000}`)
    expect(halfText).toContain('30분')
  })
})

describe('분류 우선순위·해제시각', () => {
  it('한도 신호와 길이 신호가 같이 있으면 한도가 이긴다 — 먼저 적힌 표가 우선이다', () => {
    expect(classifyEngineFailure('429 context length exceeded')).toBe('usage-limit')
    expect(classifyEngineFailure('rate limit, maximum context reached')).toBe('usage-limit')
  })

  it('파이프 뒤 10자리 초·13자리 밀리초를 해제시각으로 읽는다', () => {
    expect(limitResetAt('Claude AI usage limit reached|1758067200')?.getTime()).toBe(
      1758067200 * 1000
    )
    expect(limitResetAt('usage limit|1758067200000')?.getTime()).toBe(1758067200000)
    expect(limitResetAt('그냥 깨졌다')).toBeNull()
  })
})
