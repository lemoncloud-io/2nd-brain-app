import { describe, expect, it } from 'vitest'
import type { GitFailure } from './git'
import { classifyGitFailure, failureKind, lastStderrLine } from './git-failure'

const run = (failure: GitFailure['failure'], stderr = ''): GitFailure => ({
  ok: false,
  code: null,
  stderr,
  failure
})

describe('classifyGitFailure', () => {
  it('실제로 보는 stderr를 종류로 가른다', () => {
    expect(classifyGitFailure('fatal: Authentication failed for https://github.com/')).toBe('auth')
    expect(classifyGitFailure('error: failed to push some refs ... Updates were rejected')).toBe(
      'rejected'
    )
    expect(classifyGitFailure('fatal: Could not resolve host github.com')).toBe('offline')
    expect(classifyGitFailure('ERROR: Repository not found.')).toBe('not-found')
    expect(classifyGitFailure('zzz unrelated output')).toBe('unknown')
  })

  it('두 패턴에 걸리면 앞선 종류가 이긴다 — offline이 not-found보다 먼저다', () => {
    expect(
      classifyGitFailure(
        'Permission denied (publickey). fatal: Could not read from remote repository.'
      )
    ).toBe('offline')
  })
})

describe('failureKind', () => {
  it('로그인하지 않은 실패는 stderr를 보지 않는다', () => {
    expect(failureKind(run('login', 'fatal: Authentication failed'))).toBe('login')
  })

  it('그 밖은 stderr 분류를 따른다', () => {
    expect(failureKind(run('exit', 'fatal: Authentication failed'))).toBe('auth')
    expect(failureKind(run('exit', 'boom'))).toBe('unknown')
  })
})

describe('lastStderrLine', () => {
  it('빈 stderr는 꼬리를 붙이지 않는다', () => {
    expect(lastStderrLine('')).toBe('')
    expect(lastStderrLine('   \n  ')).toBe('')
  })

  it('여러 줄이면 마지막 줄만 붙인다', () => {
    expect(lastStderrLine('first\nsecond\n')).toBe(' — second')
    expect(lastStderrLine('only')).toBe(' — only')
  })
})
