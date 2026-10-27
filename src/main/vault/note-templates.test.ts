import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listTemplates } from './note-templates'

describe('listTemplates', () => {
  it('templates/ 바로 아래 md 만 이름순으로', () => {
    const vault = mkdtempSync(join(tmpdir(), 'tpl-'))
    mkdirSync(join(vault, 'templates', 'sub'), { recursive: true })
    writeFileSync(join(vault, 'templates', '회의.md'), '')
    writeFileSync(join(vault, 'templates', 'daily.md'), '')
    writeFileSync(join(vault, 'templates', 'a.png'), '')
    writeFileSync(join(vault, 'templates', 'sub', 'x.md'), '')
    expect(listTemplates(vault)).toEqual([
      { rel: 'templates/daily.md', name: 'daily' },
      { rel: 'templates/회의.md', name: '회의' }
    ])
  })

  it('폴더가 없으면 빈 목록', () => {
    expect(listTemplates(mkdtempSync(join(tmpdir(), 'tpl-')))).toEqual([])
  })
})
