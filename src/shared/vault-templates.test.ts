import { describe, expect, it } from 'vitest'
import { findVaultTemplate, VAULT_TEMPLATES } from './vault-templates'

describe('findVaultTemplate', () => {
  it('id 로 템플릿을 찾는다', () => {
    expect(findVaultTemplate('research')?.id).toBe('research')
    expect(findVaultTemplate('research')?.topics.length).toBeGreaterThan(0)
  })

  // 모르는 id 는 뼈대 그대로 — main 이 템플릿 없이 빈 볼트를 만든다
  it('모르는 id 는 undefined 다', () => {
    expect(findVaultTemplate('nope')).toBeUndefined()
    expect(findVaultTemplate('')).toBeUndefined()
  })

  it('표의 id 는 겹치지 않는다', () => {
    const ids = VAULT_TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const template of VAULT_TEMPLATES) {
      expect(findVaultTemplate(template.id)).toBe(template)
    }
  })
})
