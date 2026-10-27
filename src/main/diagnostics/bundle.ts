// 진단 정보 묶음 — 기록 파일 + 앱·설정 요약을 zip 하나로. 사용자가 직접 골라 팀에 보낸다(앱은 보내지 않는다).
// 설정은 허용 목록만 담는다 — 보관함 경로·GitHub 계정·첫 질문 답·MCP 명령과 env 는 어떤 모양으로도 넣지 않는다.
// 기록 본문의 보관함 경로는 `<vault>` 로 바꾼다 — 설정에서 뺀 이름이 기록으로 돌아 들어가지 않게.
import { strFromU8, strToU8, zipSync } from 'fflate'
import { normalizeChatDefaults, type ChatDefaults } from '../../shared/chat-defaults'
import { normalizeLanguage, type Language } from '../../shared/language'
import { normalizeUiPrefs, type UiPrefs } from '../../shared/ui-prefs'
import type { AppSettings } from '../settings'
import { isWindowsPath, pathPattern, redact } from './redact'

export interface DiagnosticSettings {
  claudePath?: string
  hasVault: boolean
  recentVaultCount: number
  theme?: string
  language?: Language
  engine?: string
  model?: string
  draftModel?: string
  uiPrefs?: UiPrefs
  chatDefaults?: ChatDefaults
  mcpServers?: { name: string; kind: string; enabled: boolean }[]
}

/** settings.json 은 손으로 고쳤을 수 있다 — 짧은 문자열만 그대로 싣는다 */
const shortText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length <= 80 ? value : undefined

export const pickDiagnosticSettings = (
  settings: AppSettings,
  home?: string
): DiagnosticSettings => {
  const picked: DiagnosticSettings = {
    hasVault: !!settings.vaultDir,
    recentVaultCount: Array.isArray(settings.recentVaultDirs) ? settings.recentVaultDirs.length : 0
  }
  if (typeof settings.claudePath === 'string') picked.claudePath = redact(settings.claudePath, home)
  for (const key of ['theme', 'engine', 'model', 'draftModel'] as const) {
    const text = shortText(settings[key])
    if (text !== undefined) picked[key] = text
  }
  if (settings.language !== undefined) picked.language = normalizeLanguage(settings.language)
  if (settings.uiPrefs !== undefined) picked.uiPrefs = normalizeUiPrefs(settings.uiPrefs)
  if (settings.chatDefaults !== undefined) {
    picked.chatDefaults = normalizeChatDefaults(settings.chatDefaults)
  }
  if (Array.isArray(settings.mcpServers)) {
    picked.mcpServers = settings.mcpServers
      .filter((server) => typeof server === 'object' && server !== null)
      .map(({ name, kind, enabled }) => ({
        name: shortText(name) ?? '?',
        kind: shortText(kind) ?? '?',
        enabled: enabled === true
      }))
  }
  return picked
}

/**
 * 보관함 경로 패턴 — 기록에는 이미 홈이 `~` 로 줄어 있다. 원래 모양과 줄인 모양 둘 다, 긴 것부터.
 * 홈과 같은 규칙(구분자 모양·Windows 대소문자)으로 맞춘다
 */
const vaultForms = (vaults: string[], home?: string): RegExp[] => {
  const windows = home ? isWindowsPath(home) : false
  const lower = (text: string): string => (windows ? text.toLowerCase() : text)
  return vaults
    .filter((dir) => dir.length > 1)
    .flatMap((dir) =>
      home && lower(dir).startsWith(lower(home)) ? [dir, `~${dir.slice(home.length)}`] : [dir]
    )
    .sort((a, b) => b.length - a.length)
    .map((form) => pathPattern(form, windows || isWindowsPath(form)))
}

/**
 * 줄마다 가린다 — redact 는 한 줄 상한에서 자르므로 파일 통째로 넘기면 앞부분만 남는다.
 * 정규식의 `.` 이 멈추는 줄 끝(\r·U+2028·U+2029)에서도 나눠 한 줄 안에 다른 줄이 숨지 않게
 */
const redactLines = (text: string, home: string | undefined, vaults: RegExp[]): string =>
  text
    .split(/\r\n|[\r\n\u2028\u2029]/)
    .map((line) => vaults.reduce((out, form) => out.replace(form, '<vault>'), redact(line, home)))
    .join('\n')

export interface BundleInput {
  logs: { name: string; bytes: Uint8Array }[]
  info: unknown
  home?: string
  /** 설정에 있는 보관함 경로(지금·최근) — 기록 본문에서 `<vault>` 로 바꾼다 */
  vaults?: string[]
}

/** 기록은 쓸 때 이미 가렸다 — 그 뒤에 알게 된 비밀(설정에 새로 넣은 MCP env)까지 한 번 더 가린다 */
export const buildDiagnosticsZip = ({ logs, info, home, vaults = [] }: BundleInput): Uint8Array => {
  const forms = vaultForms(vaults, home)
  const files: Record<string, Uint8Array> = {}
  for (const { name, bytes } of logs)
    files[name] = strToU8(redactLines(strFromU8(bytes), home, forms))
  files['diagnostics.json'] = strToU8(redactLines(JSON.stringify(info, null, 2), home, forms))
  return zipSync(files)
}
