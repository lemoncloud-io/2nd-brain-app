// 사용자 설정 — userData/settings.json 하나가 단일 출처다.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ThemeSetting } from '../shared/theme'
import type { Language } from '../shared/language'
import type { EngineKind } from '../shared/engine-settings'
import type { UiPrefs } from '../shared/ui-prefs'
import type { McpServer } from '../shared/mcp-servers'
import type { ChatDefaults } from '../shared/chat-defaults'
import type { GithubUser } from './github/user'

export interface AppSettings {
  claudePath?: string
  vaultDir?: string
  /** 최근에 연 보관함 — 새 창·빠른 전환이 쓴다. 최대 RECENT_VAULT_LIMIT, 맨 앞이 가장 최근 */
  recentVaultDirs?: string[]
  theme?: ThemeSetting
  /** 화면 언어 — 없으면 한국어. 읽을 때 normalizeLanguage 로 거른다 */
  language?: Language
  /** 엔진 CLI — 없으면 claude (슬라이스 09) */
  engine?: EngineKind
  /** 모든 용도가 쓰는 모델 하나 — 없으면 CLI 기본 모델 */
  model?: string
  /** 위키 초안만 따로 쓰는 모델 — 없으면 위 모델과 같다. 엔진 설정을 저장하면 지운다(엔진을 바꾸면 비운다) */
  draftModel?: string
  /** 옛 용도별 모델 — 읽기만 한다(model 이 없으면 chat 값을 이어받는다). 엔진 설정을 저장하면 지운다 */
  models?: Record<string, unknown>
  /** 고급 표시 — 없으면 둘 다 꺼짐(shared/ui-prefs.ts) */
  uiPrefs?: UiPrefs
  /** 채팅이 쓸 MCP 서버 — 읽을 때 normalizeMcpServers 로 거른다 */
  mcpServers?: McpServer[]
  /** 채팅 기본값 — 질문마다 따라가는 권한 모드. 읽을 때 normalizeChatDefaults 로 거른다 */
  chatDefaults?: ChatDefaults
  /** 로그인한 GitHub 계정 — 앱 커밋의 작성자. 읽을 때 parseGithubUser 로 거른다 */
  githubUser?: GithubUser
  /** 첫 실행에 템플릿으로 만들었지만 아직 받지 못한 저장소 `owner/name` — 다시 누르면 새로 만들지 않고 이것을 받는다 */
  onboardingRepo?: string
  /** 첫 질문 답 — 보관함이 생기기 전에만 여기 둔다. 보관함이 열리면 purpose.md 로 옮기고 지운다 */
  onboardingPurpose?: string
  /** 개발자 모드 — 상세 기록·배포본 DevTools·성능 손잡이. 없으면 꺼짐. 읽을 때 `=== true` 만 켠다 */
  developerMode?: boolean
}

const settingsFile = (dir: string): string => join(dir, 'settings.json')

export const loadSettings = (dir: string): AppSettings => {
  const file = settingsFile(dir)
  if (!existsSync(file)) return {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as AppSettings
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed
  } catch {
    // 파싱 실패 — 아래 격리로 폴스루
  }
  // 손상 파일을 삭제 대신 격리: 다음 saveSettings가 증거 없이 덮어쓰지 못하게 한다.
  // 부팅 경로이므로 격리 실패해도 throw 없이 기본값으로 계속한다.
  try {
    renameSync(file, `${file}.corrupt-${Date.now()}-${process.pid}`)
  } catch {
    // 격리 실패 — 읽기는 기본값으로 계속
  }
  return {}
}

export const saveSettings = (dir: string, settings: AppSettings): void => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(settingsFile(dir), JSON.stringify(settings, null, 2) + '\n')
}

/** 첫 질문 답의 글자 수 상한 — 한 줄 목표다 */
export const PURPOSE_ANSWER_LIMIT = 300

/** 첫 질문 답 정규화 — 문자열이 아니거나 비면 null, 줄바꿈·연속 공백은 한 칸으로, 상한에서 자른다 */
export const normalizeOnboardingPurpose = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, PURPOSE_ANSWER_LIMIT)
  return text === '' ? null : text
}

/** 최근 보관함 수 상한 */
export const RECENT_VAULT_LIMIT = 10

/** 보관함 키 — 꼬리 구분자를 떼고 소문자로. macOS·Windows FS가 대소문자를 가리지 않는다 */
export const normalizeVaultKey = (dir: string): string => resolve(dir).toLowerCase()

/**
 * 최근 보관함 기록 — 맨 앞에 쌓고, 같은 폴더는 하나로 합친다.
 * macOS·Windows 파일 시스템이 대소문자를 가리지 않아 비교는 소문자로, 꼬리 구분자는 뗀다.
 */
export const recordRecentVault = (recents: string[] | undefined, dir: string): string[] => {
  const norm = resolve(dir)
  const key = normalizeVaultKey(dir)
  const kept = (recents ?? []).filter((entry) => normalizeVaultKey(entry) !== key)
  return [norm, ...kept].slice(0, RECENT_VAULT_LIMIT)
}
