// 테마 설정 — settings.json 단일 출처, 첫 페인트 깜빡임은 main 이 부팅 인자로 넘겨 preload 가 읽는다.
export type ThemeSetting = 'light' | 'dark'

export const THEME_ARG_PREFIX = '--theme='

export const themeArg = (theme: ThemeSetting): string => `${THEME_ARG_PREFIX}${theme}`

// sandbox preload 는 fs 를 못 읽는다 — process.argv 에서만 초기 테마를 안다.
export const themeFromArgv = (argv: string[]): ThemeSetting => {
  const arg = argv.find((a) => a.startsWith(THEME_ARG_PREFIX))
  return arg === `${THEME_ARG_PREFIX}dark` ? 'dark' : 'light'
}
