import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVault } from './vault-service'
import { readJourney } from './journey'

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

describe('readJourney', () => {
  it('자료 → 위키화 → 병합 → 되돌리기를 볼트 git 에서 읽는다', () => {
    const vault = mkdtempSync(join(tmpdir(), 'journey-'))
    try {
      expect(createVault(vault).ok).toBe(true)
      expect(readJourney(vault)).toEqual({ clippings: 0, ingested: false, merged: false })

      writeFileSync(join(vault, 'Clippings', 'note.md'), '# note\n')
      expect(readJourney(vault)).toEqual({ clippings: 1, ingested: false, merged: false })

      const branch = 'app/ingest-2026-09-16'
      git(vault, 'checkout', '-q', '-b', branch)
      git(vault, 'add', '-A')
      git(vault, 'commit', '-q', '-m', 'ingest')
      expect(readJourney(vault)).toMatchObject({ ingested: true, merged: false })

      git(vault, 'checkout', '-q', 'main')
      const before = git(vault, 'rev-parse', 'main')
      git(vault, 'merge', '--no-ff', '-q', '-m', `merge: ${branch}`, branch)
      expect(readJourney(vault)).toMatchObject({ ingested: true, merged: true })

      git(vault, 'reset', '-q', '--hard', before)
      expect(readJourney(vault)).toMatchObject({ ingested: true, merged: false })
    } finally {
      rmSync(vault, { recursive: true, force: true })
    }
  })
})
