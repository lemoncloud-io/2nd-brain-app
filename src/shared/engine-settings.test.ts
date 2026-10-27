import { describe, expect, it } from 'vitest'
import { isListedModel, normalizeEngineSettings } from './engine-settings'

describe('normalizeEngineSettings', () => {
  it('설정이 없으면 Claude 엔진·모델 지정 없음이다', () => {
    expect(normalizeEngineSettings(undefined)).toEqual({ engine: 'claude' })
    expect(normalizeEngineSettings(null)).toEqual({ engine: 'claude' })
    expect(normalizeEngineSettings({})).toEqual({ engine: 'claude' })
  })

  it('알려진 엔진만 받고 모르는 값은 Claude 로 둔다', () => {
    expect(normalizeEngineSettings({ engine: 'codex' }).engine).toBe('codex')
    expect(normalizeEngineSettings({ engine: 'gpt' }).engine).toBe('claude')
  })

  it('모델은 하나다 — 앞뒤 공백을 떼고, 빈 값·문자열 아닌 값은 지정 없음', () => {
    expect(normalizeEngineSettings({ model: ' sonnet ' }).model).toBe('sonnet')
    expect(normalizeEngineSettings({ model: '' }).model).toBeUndefined()
    expect(normalizeEngineSettings({ model: 3 }).model).toBeUndefined()
  })

  it('CLI 플래그로 읽힐 수 있는 모델 이름(- 로 시작·공백 포함)은 뺀다', () => {
    expect(
      normalizeEngineSettings({ model: '--dangerously-skip-permissions' }).model
    ).toBeUndefined()
    expect(normalizeEngineSettings({ model: 'opus --verbose' }).model).toBeUndefined()
    expect(normalizeEngineSettings({ model: 'claude-opus-5[1m]' }).model).toBe('claude-opus-5[1m]')
  })

  it('옛 용도별 설정만 있으면 채팅 모델을 이어받는다 — 다른 용도 값은 버린다', () => {
    expect(normalizeEngineSettings({ models: { chat: 'opus', ingest: 'sonnet' } })).toEqual({
      engine: 'claude',
      model: 'opus'
    })
    // 채팅 칸이 비었으면 이어받을 것이 없다 — 위키화 모델을 채팅에 쓰면 고른 적 없는 모델이 된다
    expect(normalizeEngineSettings({ models: { ingest: 'sonnet' } }).model).toBeUndefined()
  })

  it('새 model 이 있으면 옛 models 보다 먼저다', () => {
    expect(normalizeEngineSettings({ model: 'fable', models: { chat: 'opus' } }).model).toBe(
      'fable'
    )
  })

  it('위키 초안 모델은 따로 둘 수 있다 — 비우면 없고, 위 모델과 같아도 없다', () => {
    expect(normalizeEngineSettings({ model: 'sonnet', draftModel: ' haiku ' })).toEqual({
      engine: 'claude',
      model: 'sonnet',
      draftModel: 'haiku'
    })
    expect(normalizeEngineSettings({ model: 'sonnet', draftModel: '' }).draftModel).toBeUndefined()
    expect(
      normalizeEngineSettings({ model: 'sonnet', draftModel: 'sonnet' }).draftModel
    ).toBeUndefined()
    expect(normalizeEngineSettings({ draftModel: 'haiku' })).toEqual({
      engine: 'claude',
      draftModel: 'haiku'
    })
  })

  it('위키 초안 모델 이름도 CLI 플래그로 읽힐 수 있으면 뺀다', () => {
    expect(
      normalizeEngineSettings({ model: 'sonnet', draftModel: '--model x' }).draftModel
    ).toBeUndefined()
  })
})

describe('isListedModel', () => {
  it('Claude 는 목록의 별칭만, Codex 는 목록이 없다', () => {
    expect(isListedModel('claude', 'sonnet')).toBe(true)
    expect(isListedModel('claude', 'claude-opus-5[1m]')).toBe(false)
    expect(isListedModel('codex', 'sonnet')).toBe(false)
  })
})
