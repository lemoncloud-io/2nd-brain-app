// 화면 언어 — settings.json 단일 출처. 첫 페인트 언어는 테마처럼 main 이 부팅 인자로 넘기고 preload 가 읽는다.
export const LANGUAGES = ['ko', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

/** 언어 이름은 그 언어로 쓴다 — 어느 언어 화면에서든 자기 말을 찾을 수 있게 */
export const LANGUAGE_NAMES: Record<Language, string> = {
  ko: '한국어', // ui-hangul-ignore: 언어 이름은 그 언어로 쓴다
  en: 'English'
}

/** Chromium 의 `--lang` 과 겹치지 않는 이름 — 그 스위치는 렌더러 로캘을 바꾼다 */
export const LANGUAGE_ARG_PREFIX = '--second-brain-lang='

export const normalizeLanguage = (raw: unknown): Language =>
  LANGUAGES.find((lang) => lang === raw) ?? 'ko'

export const languageArg = (lang: Language): string => `${LANGUAGE_ARG_PREFIX}${lang}`

// sandbox preload 는 fs 를 못 읽는다 — process.argv 에서만 초기 언어를 안다.
export const languageFromArgv = (argv: string[]): Language =>
  normalizeLanguage(
    argv.find((a) => a.startsWith(LANGUAGE_ARG_PREFIX))?.slice(LANGUAGE_ARG_PREFIX.length)
  )

/** 날짜·숫자 포맷 로캘 */
export const localeOf = (lang: Language): string => (lang === 'en' ? 'en-US' : 'ko-KR')
