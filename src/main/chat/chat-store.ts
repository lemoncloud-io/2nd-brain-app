// ChatStore — 볼트별 대화 영속화 (슬라이스 11).
// userData/chats/<sha256(realpath 볼트) 앞 16자>/index.json + <대화 id>.json
// 메시지는 대화당 최근 100개, 쓰기는 임시 파일 → rename 원자적.
// 깨진 JSON 은 *.corrupt-<ts> 로 옮기고 빈 값으로 돌아간다 — 조용히 덮어써 기록을 잃지 않게.
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ChangeSet, ChatMessage } from '../../shared/ipc-contract'
import { vaultKey } from '../vault/vault-key'
import { writeJsonAtomic } from '../fs/write-json-atomic'
import { lastTurn } from '../../shared/chat-turn'

export type ChatSummary = { id: string; title: string; updatedAt: number }

export type ChatStore = {
  /** 볼트 디렉터리 → 저장 키. 볼트를 옮기면 realpath 해시가 바뀌어 이전 대화가 안 보인다(알려진 한계) */
  vaultKey: (vaultDir: string) => string
  list: (vaultDir: string) => ChatSummary[]
  create: (vaultDir: string, title: string) => ChatSummary
  rename: (vaultDir: string, id: string, title: string) => boolean
  remove: (vaultDir: string, id: string) => boolean
  load: (
    vaultDir: string,
    id: string
  ) => { messages: ChatMessage[]; sessionId: string | null } | null
  append: (vaultDir: string, id: string, message: ChatMessage) => void
  saveSession: (vaultDir: string, id: string, sessionId: string | null) => void
  /**
   * 다시 답하기 — 질문 뒤의 마지막 답을 새 답으로 바꾼다. 지우기와 쓰기를 한 번에 해서, 중간에 꺼져도
   * 앞 답과 새 답 중 하나는 남는다. 끝이 질문·답 한 쌍이 아니거나 대화가 없으면 바꾸지 않고 false
   */
  replaceLastAnswer: (vaultDir: string, id: string, answer: ChatMessage) => boolean
  /**
   * 변경 카드를 바꾼다 — 같은 id 의 카드가 있으면 그 자리를, 없으면(끊긴 실행) 새 답으로 붙인다.
   * 대화가 지워졌으면 false
   */
  applyChanges: (vaultDir: string, id: string, changes: ChangeSet) => boolean
}

const MAX_MESSAGES = 100

type IndexEntry = ChatSummary

type ConversationFile = { messages: ChatMessage[]; sessionId: string | null }

const readJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

/** 깨진 JSON 은 기록 보존을 위해 corrupt-<ts> 로 옮긴다 */
const quarantine = (path: string): void => {
  try {
    renameSync(path, `${path}.corrupt-${Date.now()}`)
  } catch {
    // 옮길 파일이 없다
  }
}

export const createChatStore = (userDataDir: string | (() => string)): ChatStore => {
  const resolveDir = (): string => (typeof userDataDir === 'function' ? userDataDir() : userDataDir)
  const vaultDirFor = (vaultDir: string): string => {
    const dir = join(resolveDir(), 'chats', vaultKey(vaultDir))
    mkdirSync(dir, { recursive: true })
    return dir
  }

  const indexPath = (vaultDir: string): string => join(vaultDirFor(vaultDir), 'index.json')

  const readIndex = (vaultDir: string): IndexEntry[] => {
    const raw = readJson<IndexEntry[]>(indexPath(vaultDir))
    if (raw === null) {
      // 파일이 없는 것(첫 실행)과 깨진 것을 구분 — 깨진 것만 격리한다
      if (readdirSync(vaultDirFor(vaultDir)).includes('index.json')) {
        quarantine(indexPath(vaultDir))
        return []
      }
      return []
    }
    return Array.isArray(raw) ? raw : []
  }

  const writeIndex = (vaultDir: string, entries: IndexEntry[]): void => {
    writeJsonAtomic(indexPath(vaultDir), entries)
  }

  const convPath = (vaultDir: string, id: string): string =>
    join(vaultDirFor(vaultDir), `${id}.json`)

  /** 대화 목록의 최근순 — 메시지를 쓸 때마다 올린다 */
  const touch = (vaultDir: string, id: string): void => {
    const index = readIndex(vaultDir)
    const entry = index.find((e) => e.id === id)
    if (entry) {
      entry.updatedAt = Date.now()
      writeIndex(vaultDir, index)
    }
  }

  const store: ChatStore = {
    vaultKey,

    list(vaultDir) {
      return [...readIndex(vaultDir)].sort((a, b) => b.updatedAt - a.updatedAt)
    },

    create(vaultDir, title) {
      const entry: ChatSummary = { id: randomUUID(), title, updatedAt: Date.now() }
      writeIndex(vaultDir, [entry, ...readIndex(vaultDir)])
      writeJsonAtomic(convPath(vaultDir, entry.id), { messages: [], sessionId: null })
      return entry
    },

    rename(vaultDir, id, title) {
      const index = readIndex(vaultDir)
      const found = index.find((e) => e.id === id)
      if (!found) return false
      found.title = title
      writeIndex(vaultDir, index)
      return true
    },

    remove(vaultDir, id) {
      const index = readIndex(vaultDir)
      if (!index.some((e) => e.id === id)) return false
      writeIndex(
        vaultDir,
        index.filter((e) => e.id !== id)
      )
      rmSync(convPath(vaultDir, id), { force: true })
      return true
    },

    load(vaultDir, id) {
      const raw = readJson<ConversationFile>(convPath(vaultDir, id))
      if (raw === null) {
        if (readdirSync(vaultDirFor(vaultDir)).includes(`${id}.json`)) {
          quarantine(convPath(vaultDir, id))
        }
        return null
      }
      return { messages: raw.messages ?? [], sessionId: raw.sessionId ?? null }
    },

    append(vaultDir, id, message) {
      const raw = readJson<ConversationFile>(convPath(vaultDir, id)) ?? {
        messages: [],
        sessionId: null
      }
      raw.messages = [...raw.messages, message].slice(-MAX_MESSAGES)
      writeJsonAtomic(convPath(vaultDir, id), raw)
      touch(vaultDir, id)
    },

    saveSession(vaultDir, id, sessionId) {
      const raw = readJson<ConversationFile>(convPath(vaultDir, id))
      if (raw === null) return
      raw.sessionId = sessionId
      writeJsonAtomic(convPath(vaultDir, id), raw)
    },

    replaceLastAnswer(vaultDir, id, answer) {
      const raw = readJson<ConversationFile>(convPath(vaultDir, id))
      if (raw === null || lastTurn(raw.messages ?? [])?.answer == null) return false
      raw.messages = [...raw.messages.slice(0, -1), answer]
      writeJsonAtomic(convPath(vaultDir, id), raw)
      touch(vaultDir, id)
      return true
    },

    applyChanges(vaultDir, id, changes) {
      const raw = readJson<ConversationFile>(convPath(vaultDir, id))
      if (raw === null) return false
      const messages = raw.messages ?? []
      const index = messages.findIndex((m) => m.changes?.id === changes.id)
      if (index >= 0) {
        messages[index] = { ...messages[index]!, changes }
        raw.messages = messages
        writeJsonAtomic(convPath(vaultDir, id), raw)
        return true
      }
      store.append(vaultDir, id, { role: 'assistant', text: '', refs: [], changes })
      return true
    }
  }
  return store
}
