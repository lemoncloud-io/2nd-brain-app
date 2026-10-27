import { describe, expect, it } from 'vitest'
import { DEFAULT_UI_PREFS, normalizeUiPrefs } from './ui-prefs'

describe('normalizeUiPrefs', () => {
  it('기본은 둘 다 꺼짐 — 고급 표시는 켠 사람에게만 보인다', () => {
    expect(DEFAULT_UI_PREFS).toEqual({ showFileExtensions: false, showChatMeters: false })
  })

  it('없는 설정·잘못된 타입은 기본값으로', () => {
    expect(normalizeUiPrefs(undefined)).toEqual(DEFAULT_UI_PREFS)
    expect(normalizeUiPrefs(null)).toEqual(DEFAULT_UI_PREFS)
    expect(normalizeUiPrefs('켜짐')).toEqual(DEFAULT_UI_PREFS)
    expect(normalizeUiPrefs({ showFileExtensions: 'yes' })).toEqual(DEFAULT_UI_PREFS)
    expect(normalizeUiPrefs({ showFileExtensions: 1 })).toEqual(DEFAULT_UI_PREFS)
  })

  it('boolean 은 그대로 살린다', () => {
    expect(normalizeUiPrefs({ showFileExtensions: true })).toEqual({
      showFileExtensions: true,
      showChatMeters: false
    })
    expect(normalizeUiPrefs({ showFileExtensions: true, showChatMeters: true })).toEqual({
      showFileExtensions: true,
      showChatMeters: true
    })
  })

  it('모르는 키는 떨군다 — 옛 설정이 남아도 계약 밖의 값은 밖으로 안 나간다', () => {
    expect(normalizeUiPrefs({ showChatMeters: true, showTokens: true })).toEqual({
      showFileExtensions: false,
      showChatMeters: true
    })
  })
})
