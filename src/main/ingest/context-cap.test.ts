import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVault } from '../vault/vault-service'
import { RELATED_MAX_CHARS, RELATED_MAX_COUNT, runPipeline, type DraftRunner } from './pipeline'

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

const DRAFT_OUTPUT = [
  '```',
  '@@ wiki/cap-test.md',
  '---',
  'type: concept',
  'topics: []',
  'status: draft',
  '---',
  '# 캡 테스트',
  '',
  '## Summary',
  '',
  '본문이다.',
  '```'
].join('\n')

describe('runPipeline 컨텍스트 캡', () => {
  it('관련 노트는 최대 3개·개당 2000자로 잘려 프롬프트가 폭증하지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'context-cap-'))
    try {
      expect(createVault(dir).ok).toBe(true)
      // 클리핑과 겹치는 키워드(바나나우유)를 든 10k자 위키 페이지 8개
      mkdirSync(join(dir, 'wiki'), { recursive: true })
      for (let i = 0; i < 8; i += 1) {
        const body = `${'바나나우유 '.repeat(500)}꼬리${i}\n`
        writeFileSync(join(dir, 'wiki', `note-${i}.md`), `# 노트 ${i}\n\n${body}`)
      }
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'seed wiki')
      mkdirSync(join(dir, 'Clippings'), { recursive: true })
      writeFileSync(
        join(dir, 'Clippings', 'clip.md'),
        '---\ntitle: 바나나우유\n---\n\n바나나우유에 대한 클리핑 본문이다.\n'
      )

      let prompt = ''
      const runner: DraftRunner = {
        run: async function* (p: string) {
          prompt = p
          yield { type: 'text', text: DRAFT_OUTPUT }
          yield { type: 'done', ok: true, canceled: false }
        },
        isCanceled: () => false
      }
      const outcome = await runPipeline(dir, runner, () => {})
      expect(outcome).toMatchObject({ status: 'succeeded' })

      // 관련 노트 FILE 블록 수 = 갱신대상(0) + bodies(≤3)
      const fileBlocks = [...prompt.matchAll(/--- FILE (wiki\/[^\s]+)/g)].map((m) => m[1])
      expect(fileBlocks.length).toBeLessThanOrEqual(RELATED_MAX_COUNT)
      expect(fileBlocks.length).toBeGreaterThan(0)
      // 개당 캡 이하 + 잘림 표시
      for (const rel of fileBlocks) {
        const marker = `--- FILE ${rel}`
        const start = prompt.indexOf(marker)
        const next = prompt.indexOf('--- FILE ', start + marker.length)
        const end = prompt.indexOf('\n\nOutput contract', start)
        const blockEnd = next === -1 ? (end === -1 ? prompt.length : end) : next
        const block = prompt.slice(start, blockEnd)
        expect(block.length).toBeLessThanOrEqual(marker.length + RELATED_MAX_CHARS + 200)
      }
      expect(prompt).toContain('…(이하 잘림')
      // 옛 동작(8전문)이면 8만자 이상 — 지금은 그 절반도 안 돼야 한다
      expect(prompt.length).toBeLessThan(8 * 10000)
      // 시드 원문이 프롬프트 어딘가엔 살아 있다(과도 절삭 아님)
      expect(prompt).toContain('바나나우유')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
