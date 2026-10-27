// 화면 문구 사전 — main·renderer 가 같이 쓴다. 문구는 문자열이거나 인자를 받는 함수다(조사·복수는 함수 안에서).
// 고르는 쪽: renderer `lib/i18n.ts`(useT·getT), main `main/i18n.ts`(mainT). shared 의 헬퍼는 부르는 시점에 currentT().
import type { Language } from '../language'
import { en } from './en'
import { ko } from './ko'

export type Messages = typeof ko

export const messages = (lang: Language): Messages => (lang === 'en' ? en : ko)

// 이 프로세스(main 또는 창 하나)의 현재 언어 — main 은 setMainLanguage, renderer 는 applyLanguage 가 바꾼다.
// shared 헬퍼가 인자로 언어를 받지 않아도 같은 프로세스의 화면 언어를 따르게 한다.
let current: Language = 'ko'

export const setCurrentLanguage = (lang: Language): void => {
  current = lang
}

export const currentLanguage = (): Language => current

export const currentT = (): Messages => messages(current)
