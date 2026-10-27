// main 이 화면으로 보내는 문구의 언어 — 부팅 때 settings.json 에서, 설정에서 바꿀 때 같은 핸들러가 갱신한다.
// 문구는 쓰는 시점에 mainT() 로 읽는다 — 모듈 최상단 상수에 굳히면 언어를 바꿔도 남는다.
import { currentLanguage, currentT, setCurrentLanguage, type Messages } from '../shared/i18n'
import { normalizeLanguage, type Language } from '../shared/language'
import { loadSettings, saveSettings } from './settings'

export const setMainLanguage = (lang: Language): void => setCurrentLanguage(lang)

export const mainLanguage = (): Language => currentLanguage()

export const mainT = (): Messages => currentT()

/**
 * 설정에서 언어를 바꾼다 — renderer 입력을 거르고, 저장한 뒤 main 문구 언어를 바꾸고 알린다(다른 창도 바로 바뀌게).
 * 저장이 던지면 그 뒤는 하지 않는다 — main 언어와 저장값이 어긋나지 않게
 */
export const changeLanguage = (
  dir: string,
  raw: unknown,
  notify: (lang: Language) => void
): Language => {
  const language = normalizeLanguage(raw)
  saveSettings(dir, { ...loadSettings(dir), language })
  setMainLanguage(language)
  notify(language)
  return language
}
