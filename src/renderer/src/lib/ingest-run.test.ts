import { describe, expect, it } from 'vitest'
import { runLabel } from './ingest-run'

describe('runLabel', () => {
  it.each([
    ['app/ingest-2026-09-15', '9월 15일 위키 초안'],
    ['app/ingest-2026-01-03-2', '1월 3일 위키 초안 (2번째)'],
    ['feature/other', '이번 위키 초안']
  ])('%s → %s', (branch, label) => {
    expect(runLabel(branch)).toBe(label)
  })
})
