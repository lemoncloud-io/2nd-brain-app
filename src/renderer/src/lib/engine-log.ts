// 위키화 기록 문구 — 엔진이 알린 도구 호출을 비개발자가 읽는 말로 바꾼다.
// 엔진 원문(도구 이름·명령)은 버리지 않고 raw 로 남겨 툴팁에서 볼 수 있게 한다.
import type { EngineEvent } from '../../../shared/ipc-contract'
import { toUserError } from './user-error'
import type { Messages } from '../../../shared/i18n'
import { getT } from './i18n'

export type LogLine =
  | { kind: 'text' | 'thinking' | 'done' | 'phase'; label: string }
  /** 엔진 원문은 raw 로 남긴다 — 도움을 청할 때 줄 것이 있어야 한다 */
  | { kind: 'error'; label: string; raw: string }
  | { kind: 'step'; label: string; detail: string; raw: string }

/** 명령에서 온 기록 줄 — 보조 글(명령 첫 줄)과 원문은 접힌 자세히에만 둔다 */
export const isCommandLine = (line: LogLine): boolean =>
  line.kind === 'step' && (line.raw.startsWith('Bash ') || line.raw.startsWith('command '))

// claude 가 파일을 쓰면 tool 뒤에 같은 경로의 file-change 가 한 번 더 온다 — 두 줄로 보이지 않게 거른다
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

// 엔진은 절대 경로로 알린다 — 기록에는 볼트 안 위치만 남긴다
const inVault = (text: string, vaultDir: string | null): string =>
  vaultDir ? text.replaceAll(`${vaultDir}/`, '') : text

// codex 는 명령을 `/bin/zsh -lc "…"` 로 감싸 알린다(녹화 fixtures/fake-codex/recorded)
const SHELL_WRAP = /^\/bin\/(?:ba|z)?sh\s+-l?c\s+"([\s\S]*)"$/

const unwrapCommand = (command: string): string => {
  const trimmed = command.trim()
  return SHELL_WRAP.exec(trimmed)?.[1] ?? trimmed
}

// 한 명령에 여러 단계가 이어질 수 있다(브랜치 → 패치 → 커밋) — 결과에 가장 가까운 것부터 본다
export const commandLabel = (command: string): string => {
  const c = unwrapCommand(command)
  const t = getT().engineLog
  if (/\bgit\s+commit\b/.test(c)) return t.commit
  if (/vault_verify\.py/.test(c)) return t.verify
  if (/\bapply_patch\b/.test(c)) return t.patch
  if (/\bgit\s+(?:switch\s+-c|checkout\s+-b)\b/.test(c)) return t.branch
  if (/^git\s+(?:status|diff|log|show)\b/.test(c)) return t.inspect
  if (/^(?:cat|head|tail|less)\b/.test(c)) return t.readFile
  return t.command
}

const DETAIL_MAX = 80

// 명령은 여러 줄(패치 본문)일 수 있다 — 첫 줄만, 길면 자른다
const commandDetail = (command: string): string => {
  const first = unwrapCommand(command).split('\n')[0]
  return first.length > DETAIL_MAX ? `${first.slice(0, DETAIL_MAX)}…` : first
}

export const describeEvents = (
  events: EngineEvent[],
  vaultDir: string | null,
  messages: Messages = getT()
): LogLine[] => {
  const t = messages.engineLog
  const announced = new Set<string>()
  const lines: LogLine[] = []
  for (const event of events) {
    switch (event.type) {
      case 'session':
        // 세션 id 는 사용자가 쓸 데가 없다
        break
      case 'text':
        lines.push({ kind: 'text', label: event.text })
        break
      case 'thinking':
        lines.push({ kind: 'thinking', label: event.text })
        break
      case 'phase':
        lines.push({ kind: 'phase', label: event.label })
        break
      case 'tool': {
        const target = inVault(event.target, vaultDir)
        const raw = `${event.name} ${target}`.trim()
        if (event.name === 'Bash' || event.name === 'command') {
          lines.push({
            kind: 'step',
            label: commandLabel(target),
            detail: commandDetail(target),
            raw
          })
          break
        }
        if (FILE_TOOLS.has(event.name) && target) announced.add(target)
        lines.push({
          kind: 'step',
          // 모르는 도구 이름은 영어 그대로다 — 이름 대신 한 일만 말하고, 원문은 raw 에 남는다
          label: t.tool[event.name] ?? t.unknownTool,
          detail: target,
          raw
        })
        break
      }
      case 'file-change': {
        const path = inVault(event.path, vaultDir)
        if (announced.has(path)) break
        lines.push({ kind: 'step', label: t.write, detail: path, raw: `file-change ${path}` })
        break
      }
      case 'error':
        // 엔진 오류는 대개 영어다 — 사용자 말로 바꾸고 원문은 툴팁으로 남긴다
        lines.push({
          kind: 'error',
          label: toUserError(event.message, t.error).text,
          raw: event.message
        })
        break
      case 'done':
        lines.push({
          kind: 'done',
          label: event.canceled ? t.canceled : event.ok ? t.done : t.failed
        })
        break
    }
  }
  return lines
}

/**
 * 위키 초안 탭의 기록 나누기 — 사람 말 줄은 단계·오류·끝만 남긴다. 모델 본문(`@@ wiki/…` 초안 전문)과
 * 경로 줄은 자료 수만큼 쌓여 결과 버튼을 밀어냈다(2026-10-11) — 그런 줄은 접힌 자세히(folded)로만 보낸다.
 * 진행 수가 바뀌어 같은 단계가 다시 오면 한 줄로 접는다.
 */
export const splitIngestLog = (lines: LogLine[]): { shown: LogLine[]; folded: string[] } => {
  const shown: LogLine[] = []
  const folded: string[] = []
  for (const line of lines) {
    switch (line.kind) {
      case 'phase': {
        const last = shown.at(-1)
        if (last?.kind !== 'phase' || last.label !== line.label) shown.push(line)
        break
      }
      case 'done':
        shown.push(line)
        break
      case 'error':
        shown.push(line)
        folded.push(line.raw)
        break
      case 'step':
        folded.push(line.raw)
        break
      case 'text':
      case 'thinking':
        folded.push(line.label)
        break
    }
  }
  return { shown, folded }
}
