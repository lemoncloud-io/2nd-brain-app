import type { EngineKind } from '../../../shared/engine-settings'

// 엔진 설정을 고치는 칸이 둘이다 — 기본 화면의 'AI 설정'(엔진·목록 모델)과 '고급' 의 모델 직접 입력.
// 한쪽이 저장하면 다른 쪽이 다시 읽도록 창에 한 번 알린다. 저장된 값의 정본은 main 의 settings.json 이다.
const EVENT = '2nd-brain:engine-settings-changed'

export const announceEngineSettings = (): void => {
  window.dispatchEvent(new Event(EVENT))
}

/** 다른 칸이 엔진 설정을 저장하면 부른다 — 되돌린 함수로 구독을 끊는다 */
export const onEngineSettingsChanged = (listener: () => void): (() => void) => {
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}

/**
 * 엔진을 바꿔 바로 저장한다 — 모델 이름은 엔진을 건너가지 못해(Claude 별칭을 Codex 가 모른다) 기본 모델로 돌아간다.
 * 바로 저장하는 이유: 저장 전 엔진이 화면에만 있으면 '고급' 의 모델 직접 입력이 옛 엔진에 새 이름을 붙인다.
 */
export const switchEngine = async (engine: EngineKind): Promise<void> => {
  await window.api.setEngineSettings({ engine })
  announceEngineSettings()
}
