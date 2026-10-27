import { describe, expect, it } from 'vitest'
import type { ClaudeStatus, VaultStatus } from '../../../shared/ipc-contract'
import {
  engineReadiness,
  vaultReadiness,
  type EngineReadiness,
  type VaultReadiness
} from './use-setup-state'

describe('vaultReadiness', () => {
  const cases: [VaultStatus | null, VaultReadiness][] = [
    [null, 'checking'],
    [{ vaultDir: null, valid: false, missing: [] }, 'none'],
    [{ vaultDir: '/v', valid: false, missing: ['wiki'] }, 'invalid'],
    [{ vaultDir: '/v', valid: true, missing: [] }, 'ok']
  ]
  it.each(cases)('%j → %s', (status, expected) => {
    expect(vaultReadiness(status)).toBe(expected)
  })
})

describe('engineReadiness', () => {
  const cases: [ClaudeStatus | null, EngineReadiness][] = [
    [null, 'checking'],
    [{ cli: { missing: true, reason: 'not found' }, auth: { loggedIn: false } }, 'missing'],
    [{ cli: { path: '/c', version: '2.1.0' }, auth: { loggedIn: false } }, 'logged-out'],
    [{ cli: { path: '/c', version: '2.1.0' }, auth: { loggedIn: true } }, 'ok']
  ]
  it.each(cases)('%j → %s', (status, expected) => {
    expect(engineReadiness(status)).toBe(expected)
  })
})
