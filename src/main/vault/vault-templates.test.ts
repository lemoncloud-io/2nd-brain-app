import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyVaultTemplate } from './vault-templates'

const seed = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'vault-template-'))
  mkdirSync(join(dir, 'wiki'), { recursive: true })
  mkdirSync(join(dir, 'wiki', 'topics'), { recursive: true })
  for (const f of ['INDEX.md', 'TOPIC_MAP.md'])
    writeFileSync(join(dir, 'wiki', f), '# 위키\n\n_No topics yet._\n')
  return dir
}

describe('applyVaultTemplate', () => {
  it('빈 토픽이면 자리표시를 유지한다', () => {
    const dir = seed()
    try {
      applyVaultTemplate(dir, { id: 'empty', name: '빈', description: '빈', topics: [] })
      for (const f of ['INDEX.md', 'TOPIC_MAP.md'])
        expect(readFileSync(join(dir, 'wiki', f), 'utf8')).toContain('_No topics yet._')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('두 번째 파일에 자리표시가 없으면 첫 파일도 건드리지 않는다', () => {
    const dir = seed()
    try {
      writeFileSync(join(dir, 'wiki', 'TOPIC_MAP.md'), '# 위키\n')
      expect(() =>
        applyVaultTemplate(dir, {
          id: 't',
          name: 't',
          description: 't',
          topics: [{ slug: 'a', title: 'A', description: '에이' }]
        })
      ).toThrow()
      expect(readFileSync(join(dir, 'wiki', 'INDEX.md'), 'utf8')).toContain('_No topics yet._')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('토픽이 있으면 링크 목록으로 치환한다', () => {
    const dir = seed()
    try {
      applyVaultTemplate(dir, {
        id: 't',
        name: 't',
        description: 't',
        topics: [{ slug: 'a', title: 'A', description: '에이' }]
      })
      expect(readFileSync(join(dir, 'wiki', 'INDEX.md'), 'utf8')).toContain('- [[topics/a]] — 에이')
      expect(readFileSync(join(dir, 'wiki', 'TOPIC_MAP.md'), 'utf8')).toContain(
        '- [[topics/a]] — 에이'
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
