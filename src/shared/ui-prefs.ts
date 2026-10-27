// 고급 표시 — 평소에는 숨겨 두는 표기 둘. settings.json 에 저장되고 main·renderer 가 같은 정규화를 쓴다.
// 기본은 둘 다 꺼짐이다: 확장자도 컨텍스트 사용률도 이 앱의 기본 독자에게는 군더더기다
// (DESIGN.md § AI 한계 — "토큰·컨텍스트·세션은 개발자의 어휘다").

export interface UiPrefs {
  /** 트리의 파일 이름에 확장자를 그대로 보인다(클리핑 목록은 늘 짧은 이름이다) */
  showFileExtensions: boolean
  /** 채팅 컴포저 아래에 모델·컨텍스트 사용률 줄을 보인다 */
  showChatMeters: boolean
}

export const DEFAULT_UI_PREFS: UiPrefs = {
  showFileExtensions: false,
  showChatMeters: false
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** settings.json·renderer 입력을 믿지 않는다 — 모르는 키는 떨구고 boolean 이 아닌 값은 기본값이다 */
export const normalizeUiPrefs = (raw: unknown): UiPrefs => {
  const source = isRecord(raw) ? raw : {}
  const prefs = { ...DEFAULT_UI_PREFS }
  for (const key of Object.keys(DEFAULT_UI_PREFS) as (keyof UiPrefs)[]) {
    if (typeof source[key] === 'boolean') prefs[key] = source[key]
  }
  return prefs
}
