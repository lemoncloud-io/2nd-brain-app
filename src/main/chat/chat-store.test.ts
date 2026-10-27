import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChatStore } from './chat-store'

let dir: string | null = null
const userData = (): string => {
  dir ??= mkdtempSync(join(tmpdir(), 'chat-store-'))
  return dir
}

afterEach(() => {
  if (dir !== null) {
    rmSync(dir, { recursive: true, force: true })
    dir = null
  }
})

describe('ChatStore', () => {
  it('대화를 만들고 목록에서 최근순으로 보며, 같은 볼트끼리만 보인다', () => {
    const store = createChatStore(userData())
    const a = store.create('/vault', '첫 질문')
    store.create('/other', '다른 볼트')
    store.rename('/vault', a.id, '바뀐 제목')
    expect(store.list('/vault').map((c) => c.title)).toEqual(['바뀐 제목'])
    expect(store.list('/other').map((c) => c.title)).toEqual(['다른 볼트'])
  })

  it('append 로 메시지를 저장하고 load 로 읽는다 — 100개 상한, 최근 것을 남긴다', () => {
    const store = createChatStore(userData())
    const conv = store.create('/vault', '제목')
    for (let i = 0; i < 120; i++) {
      store.append('/vault', conv.id, { role: 'user', text: `m${i}`, refs: [] })
    }
    const messages = store.load('/vault', conv.id)?.messages ?? []
    expect(messages).toHaveLength(100)
    expect(messages[0].text).toBe('m20')
    expect(messages[99].text).toBe('m119')
  })

  it('append 가 index.json 의 updatedAt 을 최근순으로 갱신한다', async () => {
    // 시각을 고정한다 — 같은 ms 에 create·append 가 겹치면 정렬이 동률이 돼 흔들린다
    vi.useFakeTimers()
    try {
      const store = createChatStore(userData())
      vi.setSystemTime(1_000)
      const old = store.create('/vault', '오래된')
      vi.setSystemTime(2_000)
      const newer = store.create('/vault', '최신')
      vi.setSystemTime(3_000)
      store.append('/vault', old.id, { role: 'user', text: 'q', refs: [] })
      const titles = store.list('/vault').map((c) => c.title)
      expect(titles[0]).toBe('오래된')
      expect(titles).toContain('최신')
      expect(newer.updatedAt).toBeLessThan(store.list('/vault')[0].updatedAt)
    } finally {
      vi.useRealTimers()
    }
  })

  it('remove 하면 목록과 파일이 모두 사라진다', () => {
    const store = createChatStore(userData())
    const conv = store.create('/vault', '지울 것')
    store.append('/vault', conv.id, { role: 'user', text: 'q', refs: [] })
    expect(store.remove('/vault', conv.id)).toBe(true)
    expect(store.list('/vault')).toEqual([])
    expect(store.load('/vault', conv.id)).toBeNull()
  })

  it('깨진 index.json 은 corrupt 파일로 옮기고 빈 목록으로 뜬다', () => {
    const store = createChatStore(userData())
    const key = store.vaultKey('/vault')
    const vaultDir = join(userData(), 'chats', key)
    mkdirSync(vaultDir, { recursive: true })
    writeFileSync(join(vaultDir, 'index.json'), '{broken', 'utf8')
    expect(store.list('/vault')).toEqual([])
    const files = readdirSync(vaultDir)
    expect(files.some((f) => f.startsWith('index.json.corrupt-'))).toBe(true)
  })

  it('깨진 <id>.json 은 corrupt 로 옮기고 load 는 null — index 는 남는다', () => {
    const store = createChatStore(userData())
    const conv = store.create('/vault', '제목')
    const vaultDir = join(userData(), 'chats', store.vaultKey('/vault'))
    writeFileSync(join(vaultDir, `${conv.id}.json`), 'nope', 'utf8')
    expect(store.load('/vault', conv.id)).toBeNull()
    expect(store.list('/vault')).toHaveLength(1)
    expect(readdirSync(vaultDir).some((f) => f.startsWith(`${conv.id}.json.corrupt-`))).toBe(true)
  })

  it('쓰기는 원자적이다 — 임시 파일이 남지 않는다', () => {
    const store = createChatStore(userData())
    const conv = store.create('/vault', '제목')
    store.append('/vault', conv.id, { role: 'user', text: 'q', refs: [] })
    const vaultDir = join(userData(), 'chats', store.vaultKey('/vault'))
    expect(readdirSync(vaultDir).filter((f) => f.endsWith('.tmp'))).toEqual([])
    expect(readFileSync(join(vaultDir, 'index.json'), 'utf8')).toContain(conv.id)
  })

  it('변경 카드는 같은 id 자리를 바꾸고, 없으면 새 답으로 붙인다 — 카드 없는 예전 파일도 읽힌다', () => {
    const store = createChatStore(userData())
    const conv = store.create('/vault', '제목')
    store.append('/vault', conv.id, { role: 'user', text: 'q', refs: [] })
    const card = { id: 'run-1', files: [], blocked: ['막았다'] }
    store.append('/vault', conv.id, { role: 'assistant', text: 'a', refs: [], changes: card })
    expect(store.applyChanges('/vault', conv.id, { ...card, undone: true })).toBe(true)
    expect(store.load('/vault', conv.id)?.messages.map((m) => m.changes?.undone)).toEqual([
      undefined,
      true
    ])
    expect(store.applyChanges('/vault', conv.id, { ...card, id: 'run-2', interrupted: true })).toBe(
      true
    )
    expect(store.load('/vault', conv.id)?.messages.at(-1)).toEqual({
      role: 'assistant',
      text: '',
      refs: [],
      changes: { ...card, id: 'run-2', interrupted: true }
    })
    expect(store.applyChanges('/vault', 'gone', card)).toBe(false)
  })

  it('replaceLastAnswer 는 질문 뒤의 마지막 답을 새 답으로 한 번에 바꾼다', () => {
    const store = createChatStore(userData())
    const conv = store.create('/vault', '제목')
    for (const [role, text] of [
      ['user', 'q1'],
      ['assistant', 'a1'],
      ['user', 'q2'],
      ['assistant', 'a2']
    ] as const) {
      store.append('/vault', conv.id, { role, text, refs: [] })
    }
    const fresh = { role: 'assistant' as const, text: 'a2 새로', refs: [] }
    expect(store.replaceLastAnswer('/vault', conv.id, fresh)).toBe(true)
    expect(store.load('/vault', conv.id)?.messages.map((m) => m.text)).toEqual([
      'q1',
      'a1',
      'q2',
      'a2 새로'
    ])
    expect(store.replaceLastAnswer('/vault', 'gone', fresh)).toBe(false)
  })

  it('replaceLastAnswer 는 끝이 질문·답 한 쌍이 아니면 아무것도 바꾸지 않는다', () => {
    const store = createChatStore(userData())
    const conv = store.create('/vault', '제목')
    const fresh = { role: 'assistant' as const, text: '새 답', refs: [] }
    store.append('/vault', conv.id, { role: 'user', text: 'q', refs: [] })
    // 답이 없는 질문 — 지울 앞 답이 없다
    expect(store.replaceLastAnswer('/vault', conv.id, fresh)).toBe(false)
    store.append('/vault', conv.id, { role: 'assistant', text: 'a', refs: [] })
    const card = { id: 'run-1', files: [], blocked: [], interrupted: true }
    store.append('/vault', conv.id, { role: 'assistant', text: '', refs: [], changes: card })
    expect(store.replaceLastAnswer('/vault', conv.id, fresh)).toBe(false)
    expect(store.load('/vault', conv.id)?.messages).toHaveLength(3)
  })
})
