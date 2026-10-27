// Codex CLI 엔진 — `codex exec --json` 인자와 JSONL 이벤트 해석(슬라이스 10). 실행 수명은 cli-process.
// 이벤트 모양은 codex-cli 0.154.0 녹화본 기준: test/fixtures/fake-codex/recorded/.
import { join } from 'node:path'
import type { EngineEvent } from '../../shared/ipc-contract'
import type { EngineProfile } from './claude-engine'
import { createCliEngine, parseJsonObject, type ParsedLine } from './cli-process'
import type { Engine } from './engine'
import type { McpServer } from '../../shared/mcp-servers'
import { DETAIL_MARK } from '../../shared/engine-failure'
import { codexMcpArgs } from './mcp-args'
import { mainT } from '../i18n'

// design.md § 4.2 Codex 권한 — Codex 는 도구 허용 목록 대신 sandbox 모드. 위키화만 쓰기.
// workspace-write 는 `.git` 을 읽기 전용으로 둔다(녹화: git switch -c 가 ref 잠금 실패) — 위키화는 작업 브랜치·커밋이
// 계약이라 `--add-dir <볼트>/.git` 으로 git 쓰기를 연다(녹화: 같은 프롬프트로 브랜치·커밋 성공)
const SANDBOX: Record<EngineProfile, 'read-only' | 'workspace-write'> = {
  ingest: 'workspace-write',
  query: 'read-only',
  lint: 'read-only'
}
// 웹 검색은 켜 둔 채팅 세션만 쓴다 — 여기서는 기본값에 기대지 않고 설정 키 `web_search` 로 끈다
// (codex-cli 0.160.1 확인 2026-10-14: 모르는 값은 설정 오류로 끝난다)
const NO_WEB_SEARCH = ['-c', 'web_search="disabled"']

interface CodexItem {
  type?: string
  text?: string
  command?: string
  changes?: { path?: string; kind?: string }[]
}

interface CodexLine {
  type?: string
  thread_id?: string
  message?: string
  error?: { message?: string }
  item?: CodexItem
}

// 오류 문구는 API 응답 JSON 이 문자열로 들어온다 — 안쪽 error.message 가 있으면 그것만 쓴다
export const errorText = (raw: string | undefined): string => {
  if (!raw) return mainT().engineMain.unknownError
  try {
    const inner = JSON.parse(raw) as { error?: { message?: unknown } }
    return typeof inner.error?.message === 'string' ? inner.error.message : raw
  } catch {
    return raw
  }
}

const parseLine = (line: string): ParsedLine => {
  const parsed = parseJsonObject(line)
  if (!parsed) {
    return {
      events: [
        {
          type: 'error',
          message: `${mainT().engineMain.unreadable}${DETAIL_MARK}codex JSON parse failed: ${line.slice(0, 120)}`
        }
      ]
    }
  }
  const { type, thread_id, message, error, item } = parsed as CodexLine
  const events: EngineEvent[] = []
  switch (type) {
    case 'thread.started':
      if (typeof thread_id === 'string') events.push({ type: 'session', id: thread_id })
      return { events }
    case 'item.started':
      // 명령은 시작 때 한 번만 알린다 — completed 는 같은 명령의 결과다
      if (item?.type === 'command_execution' && item.command) {
        events.push({ type: 'tool', name: 'command', target: item.command })
      }
      // 파일 쓰기(apply_patch) — 녹화: changes[].path 는 절대경로
      if (item?.type === 'file_change') {
        for (const change of item.changes ?? []) {
          if (change.path) events.push({ type: 'file-change', path: change.path })
        }
      }
      return { events }
    case 'item.completed':
      if (item?.type === 'agent_message' && item.text)
        events.push({ type: 'text', text: item.text })
      // item 타입 error 는 경고다(녹화: 모델 메타데이터 없음 → 기본값 사용) — 실패로 치지 않는다
      return { events }
    case 'turn.completed':
      return { events, result: { ok: true, message: '' } }
    case 'turn.failed':
      return { events, result: { ok: false, message: errorText(error?.message) } }
    case 'error':
      // 뒤따르는 turn.failed 가 같은 문구를 싣는다 — 여기서는 결과만 실패로 두고 이벤트는 한 번만 낸다
      return { events, result: { ok: false, message: errorText(message) } }
    default:
      return { events }
  }
}

export const createCodexCliEngine = (
  cliPath: string,
  profile: EngineProfile = 'ingest',
  opts: { model?: string; mcp?: McpServer[] } = {}
): Engine => {
  const sandbox = SANDBOX[profile]
  const modelArgs = [...codexMcpArgs(opts.mcp ?? []), ...(opts.model ? ['-m', opts.model] : [])]
  return createCliEngine({
    name: 'codex',
    cliPath,
    lock: profile === 'ingest',
    // 프롬프트는 stdin(`-`) — 인자로 주고 stdin 을 열어 두면 codex 가 입력을 더 기다린다(녹화 stderr)
    args: ({ vaultDir }) => [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '-s',
      sandbox,
      '-C',
      vaultDir,
      ...NO_WEB_SEARCH,
      ...(profile === 'ingest' ? ['--add-dir', join(vaultDir, '.git')] : []),
      ...modelArgs,
      '-'
    ],
    parseLine,
    noResultMessage: 'codex ended without completing the turn'
  })
}
