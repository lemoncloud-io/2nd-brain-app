// 화면 언어 — 컴포넌트는 useT() 로 구독해 언어가 바뀌면 다시 그리고, 컴포넌트 밖 헬퍼는 부르는 시점에 getT() 로 읽는다.
// 번역 결과를 모듈 최상단 상수에 굳히지 않는다 — 언어를 바꿔도 그 문구만 남는다.
import { create } from 'zustand'
import { messages, setCurrentLanguage, type Messages } from '../../../shared/i18n'
import { localeOf, type Language } from '../../../shared/language'

const useLanguageStore = create<{ language: Language }>(() => ({ language: 'ko' }))

/** 고른 언어를 화면에 건다 — 저장은 하지 않는다(window.api.setLanguage 가 한다) */
export const applyLanguage = (language: Language): void => {
  // shared 헬퍼가 읽는 값을 먼저 — store 구독으로 다시 그릴 때 이미 새 언어여야 한다
  setCurrentLanguage(language)
  useLanguageStore.setState({ language })
  document.documentElement.lang = language
}

export const getLanguage = (): Language => useLanguageStore.getState().language

export const getT = (): Messages => messages(getLanguage())

export const useLanguage = (): Language => useLanguageStore((s) => s.language)

export const useT = (): Messages => messages(useLanguage())

/** 날짜·숫자 형식의 로캘 — 부르는 시점의 화면 언어 */
export const getLocale = (): string => localeOf(getLanguage())

// 언어마다 한 번만 만든다 — 편집기 글자 수처럼 자주 부르는 곳이 쓴다
const numberFormats = new Map<Language, Intl.NumberFormat>()

export const formatNumber = (n: number): string => {
  const language = getLanguage()
  let format = numberFormats.get(language)
  if (format === undefined) {
    format = new Intl.NumberFormat(localeOf(language))
    numberFormats.set(language, format)
  }
  return format.format(n)
}

/**
 * 언어가 바뀔 때마다 — React 밖(CodeMirror 위젯 등)이 다시 그리거나, 받은 때의 언어로 굳은 문장(main 이 보낸 오류)을
 * 다시 받을 때 쓴다. 해제 함수를 돌려준다
 */
export const onLanguageChange = (listener: (language: Language) => void): (() => void) =>
  useLanguageStore.subscribe((state, prev) => {
    if (state.language !== prev.language) listener(state.language)
  })
