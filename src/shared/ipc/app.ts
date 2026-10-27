import type { ThemeSetting } from '../theme'
import type { Language } from '../language'
import type { UiPrefs } from '../ui-prefs'

export const APP_CHANNELS_APP = {
  getAppInfo: 'app:get-info',
  closeWindow: 'app:close-window',
  closeCurrentTab: 'app:close-current-tab',
  getUpdateState: 'app:update-state',
  installUpdate: 'app:install-update',
  checkUpdate: 'app:check-update',
  updateChanged: 'app:update-changed',
  setTheme: 'app:set-theme',
  getLanguage: 'app:get-language',
  setLanguage: 'app:set-language',
  languageChanged: 'app:language-changed',
  getUiPrefs: 'app:get-ui-prefs',
  setUiPrefs: 'app:set-ui-prefs',
  openExternal: 'shell:open-external',
  revealInFinder: 'shell:reveal-in-finder',
  openInBrowser: 'shell:open-in-browser',
  openInObsidian: 'shell:open-in-obsidian'
} as const

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
  electronVersion: string
}

/**
 * 자동 업데이트 — off 는 이 빌드가 업데이트를 받지 않는다는 뜻이다(private 기간: 설치본은 사람이 전달).
 * ready 는 받아 두었고 다시 시작하면 설치된다
 */
export type UpdateState =
  | { kind: 'off' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest' }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  /** during: 확인·받기에서 났나(check), 받아 둔 새 버전으로 바꾸다 났나(install) — 할 일이 다르다 */
  | { kind: 'failed'; during: 'check' | 'install'; detail: string }

export interface AppApiApp {
  getAppInfo(): Promise<AppInfo>
  /**
   * 창을 닫는다 — 저장 안 한 편집을 버리기로 확인한 뒤에만 부른다(beforeunload 를 건너뛴다).
   * ⌘Q 가 그 편집에 막혔던 거면 대신 종료를 잇는다
   */
  closeWindow(): Promise<void>
  /** main이 가로챈 ⌘W — 창 대신 켜진 탭을 닫는다(Alt+⌘W 명령과 같은 closeTab) */
  onCloseCurrentTab(listener: () => void): () => void
  getUpdateState(): Promise<UpdateState>
  /** 받아 둔 새 버전으로 다시 시작한다 — 준비 전이면 false */
  installUpdate(): Promise<boolean>
  /** 지금 새 버전이 있는지 다시 본다 — 꺼진 앱은 아무것도 하지 않는다 */
  checkUpdate(): Promise<void>
  onUpdateChanged(listener: (state: UpdateState) => void): () => void
  /** 테마 저장(settings.json). 저장된 값을 반환한다 */
  setTheme(theme: ThemeSetting): Promise<ThemeSetting>
  /** 저장된 화면 언어 — reload 뒤 부팅 인자가 옛 값일 때 다시 맞춘다 */
  getLanguage(): Promise<Language>
  /** 화면 언어 저장(settings.json) — main 문구 언어도 바뀌고 모든 창에 알린다. 저장된 값을 반환한다 */
  setLanguage(language: Language): Promise<Language>
  onLanguageChanged(listener: (language: Language) => void): () => void
  /** 고급 표시 — 확장자 표시·채팅 지표. 정의는 shared/ui-prefs.ts */
  getUiPrefs(): Promise<UiPrefs>
  /** 정규화해 저장하고 저장된 값을 돌려준다 — boolean 이 아닌 값은 기본값이 된다 */
  setUiPrefs(prefs: UiPrefs): Promise<UiPrefs>
  /** 외부 링크 열기 — 리더는 http·https·mailto만 이 채널로 넘긴다 */
  openExternal(url: string): Promise<void>
  /** 미리보기 못 하는 확장자 — Finder에서 파일 표시 */
  revealInFinder(rel: string): Promise<void>
  /**
   * 보관함 html·워드·파워포인트를 기본 앱으로 — 따로 둔 js 를 읽는 페이지, 미리보기가 못 옮긴 문서 모양을 거기서 본다.
   * 그 밖 형식은 받지 않는다
   */
  openInBrowser(rel: string): Promise<void>
  /** 볼트(또는 페이지)를 Obsidian으로 열기 — 미설치면 폴더 폴백 */
  openInObsidian(
    rel?: string
  ): Promise<{ ok: true; via: 'obsidian' | 'folder' } | { error: string }>
  /** 부팅 인자에서 초기 테마 — 첫 페인트 깜빡임 방지용 */
  initialTheme(): ThemeSetting
  /** 부팅 인자에서 초기 언어 — 첫 페인트부터 고른 언어로 */
  initialLanguage(): Language
  filePathForFile(file: File): string
}
