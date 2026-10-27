import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SemanticFinding } from '../../shared/ipc-contract'
import type { SweepPage } from '../../shared/review-sweep'
import {
  createReviewItemStore,
  recordFinalizeOutcome,
  recordLintResult,
  type ReviewItemStore
} from './review-item-store'
import { vaultKey } from '../vault/vault-key'

const dirs: string[] = []
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'review-items-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const finding = (title: string, rel = 'wiki/a.md'): SemanticFinding => ({
  kind: 'outdated',
  severity: 'low',
  title,
  rel,
  detail: `${title} 설명`
})

describe('createReviewItemStore', () => {
  it('AI 점검 결과와 검증 결함을 항목으로 쌓고 볼트별로 나눠 돌려준다', () => {
    const userData = tmp()
    const store = createReviewItemStore(() => userData)
    store.addLintFindings('/v1', [finding('오래된 내용')])
    store.addVerifyDefects('/v1', ['wiki/b.md: frontmatter 파싱 실패'])
    store.addLintFindings('/v2', [finding('다른 볼트')])

    const items = store.list('/v1')
    expect(items.map((i) => [i.source, i.title, i.rel])).toEqual([
      ['ai-lint', '오래된 내용', 'wiki/a.md'],
      ['verify', 'wiki/b.md: frontmatter 파싱 실패', 'wiki/b.md']
    ])
    expect(store.list('/v2').map((i) => i.title)).toEqual(['다른 볼트'])
  })

  it('같은 발견을 다시 넣어도 하나로 남는다', () => {
    const userData = tmp()
    const store = createReviewItemStore(() => userData)
    store.addLintFindings('/v', [finding('중복')])
    store.addLintFindings('/v', [finding('중복')])
    expect(store.list('/v')).toHaveLength(1)
  })

  it('무시한 항목은 저장소를 다시 열어도, 같은 발견이 다시 들어와도 목록에 나오지 않는다', () => {
    const userData = tmp()
    const store = createReviewItemStore(() => userData)
    store.addLintFindings('/v', [finding('무시할 것'), finding('남길 것')])
    const target = store.list('/v').find((i) => i.title === '무시할 것')!
    expect(store.dismiss('/v', target.id)).toBe(true)

    const reopened = createReviewItemStore(() => userData)
    expect(reopened.list('/v').map((i) => i.title)).toEqual(['남길 것'])
    reopened.addLintFindings('/v', [finding('무시할 것')])
    expect(reopened.list('/v').map((i) => i.title)).toEqual(['남길 것'])
  })

  it('모르는 id 를 무시하면 false', () => {
    const userData = tmp()
    const store = createReviewItemStore(() => userData)
    expect(store.dismiss('/v', 'nope')).toBe(false)
  })

  it('경로를 담지 않은 결함은 rel 이 null 이다', () => {
    const userData = tmp()
    const store = createReviewItemStore(() => userData)
    store.addVerifyDefects('/v', ['raw/ 에 append-only 위반'])
    expect(store.list('/v')[0]!.rel).toBeNull()
  })

  it('저장 파일이 깨졌으면 빈 목록으로 시작한다', () => {
    const userData = tmp()
    mkdirSync(join(userData, 'review-items'), { recursive: true })
    writeFileSync(join(userData, 'review-items', `${vaultKey('/v')}.json`), '{ 깨짐')
    expect(createReviewItemStore(() => userData).list('/v')).toEqual([])
  })
})

describe('검토 항목 공급 — 실패해도 원래 결과를 돌려준다', () => {
  const broken: ReviewItemStore = {
    list: () => [],
    addLintFindings: () => {
      throw new Error('disk full')
    },
    addVerifyDefects: () => {
      throw new Error('disk full')
    },
    clearVerifyDefects: () => {
      throw new Error('disk full')
    },
    dismiss: () => false,
    listDismissed: () => [],
    restore: () => false
  }

  it('확정 검증 실패 결과의 결함을 항목으로 쌓고 결과를 그대로 돌려준다', () => {
    const userData = tmp()
    const store = createReviewItemStore(() => userData)
    const outcome = {
      status: 'verify-failed' as const,
      defects: ['wiki/a.md:3 tab used for indentation']
    }
    expect(recordFinalizeOutcome(store, '/v', outcome)).toBe(outcome)
    expect(store.list('/v').map((i) => [i.source, i.rel])).toEqual([['verify', 'wiki/a.md']])
  })

  it('병합되면 검증을 통과한 것이므로 지난 검증 결함은 지우고 AI 점검 항목은 남긴다', () => {
    const userData = tmp()
    const store = createReviewItemStore(() => userData)
    store.addLintFindings('/v', [finding('오래된 내용')])
    recordFinalizeOutcome(store, '/v', { status: 'verify-failed', defects: ['wiki/a.md:3 tab'] })
    expect(store.list('/v')).toHaveLength(2)

    const merged = {
      status: 'merged' as const,
      branch: 'b',
      rejected: [],
      teamReview: null,
      shareError: null,
      published: null,
      publishError: null
    }
    expect(recordFinalizeOutcome(store, '/v', merged)).toBe(merged)
    expect(store.list('/v').map((i) => [i.source, i.title])).toEqual([['ai-lint', '오래된 내용']])
    // 다시 열어도 지워진 채다
    expect(createReviewItemStore(() => userData).list('/v')).toHaveLength(1)
  })

  it('AI 점검 found 결과만 쌓는다', () => {
    const userData = tmp()
    const store = createReviewItemStore(() => userData)
    recordLintResult(store, '/v', { status: 'clean' })
    expect(store.list('/v')).toEqual([])
    const found = { status: 'found' as const, findings: [finding('발견')] }
    expect(recordLintResult(store, '/v', found)).toBe(found)
    expect(store.list('/v')).toHaveLength(1)
  })

  it('저장이 던져도 확정·점검 결과는 그대로 돌아온다', () => {
    const outcome = { status: 'verify-failed' as const, defects: ['x'] }
    expect(recordFinalizeOutcome(broken, '/v', outcome)).toBe(outcome)
    const merged = {
      status: 'merged' as const,
      branch: 'b',
      rejected: [],
      teamReview: null,
      shareError: null,
      published: null,
      publishError: null
    }
    expect(recordFinalizeOutcome(broken, '/v', merged)).toBe(merged)
    const found = { status: 'found' as const, findings: [finding('발견')] }
    expect(recordLintResult(broken, '/v', found)).toBe(found)
  })

  it('raw/·Clippings/ 아래 wiki 이름 경로는 위키 페이지로 잡지 않는다', () => {
    const userData = tmp()
    const store = createReviewItemStore(() => userData)
    store.addVerifyDefects('/v', [
      'Clippings/wiki/foo.md: frontmatter 없음',
      'raw/wiki/a.md 수정됨'
    ])
    expect(store.list('/v').map((i) => i.rel)).toEqual([null, null])
  })
})

describe('검토 항목 자동 정리', () => {
  const missing = (title: string): SemanticFinding => ({
    kind: 'missing-page',
    severity: 'medium',
    title,
    rel: 'wiki/a.md',
    detail: ''
  })

  it('빠진 페이지가 어디서든 생기면 목록에서 빠지고, 그 페이지를 지워도 저절로 돌아오지 않는다', () => {
    const userData = tmp()
    let pages: SweepPage[] = []
    const store = createReviewItemStore(
      () => userData,
      () => pages
    )
    store.addLintFindings('/v', [missing('머신 러닝'), finding('오래된 내용')])
    expect(store.list('/v')).toHaveLength(2)

    // 링크 칸의 만들기처럼 위키화 없이 페이지만 생겼다
    pages = [{ rel: 'wiki/머신 러닝.md', slug: 'wiki/머신 러닝', title: '머신 러닝' }]
    expect(store.list('/v').map((i) => i.title)).toEqual(['오래된 내용'])

    pages = []
    expect(
      createReviewItemStore(
        () => userData,
        () => pages
      )
        .list('/v')
        .map((i) => i.title)
    ).toEqual(['오래된 내용'])
    // 페이지를 지운 뒤 AI 점검이 다시 찾으면 새 항목으로 돌아온다
    store.addLintFindings('/v', [missing('머신 러닝')])
    expect(store.list('/v').map((i) => i.title)).toEqual(['오래된 내용', '머신 러닝'])
  })

  it('상관없는 페이지만 생겼으면 빠진 페이지 항목은 남는다', () => {
    const userData = tmp()
    const pages: SweepPage[] = [{ rel: 'wiki/딥러닝.md', slug: 'wiki/딥러닝', title: '딥러닝' }]
    const store = createReviewItemStore(
      () => userData,
      () => pages
    )
    store.addLintFindings('/v', [missing('머신 러닝')])
    expect(store.list('/v').map((i) => i.title)).toEqual(['머신 러닝'])
  })

  it('무시한 항목도 페이지가 생기면 무시 목록에서 빠진다', () => {
    const userData = tmp()
    let pages: SweepPage[] = []
    const store = createReviewItemStore(
      () => userData,
      () => pages
    )
    store.addLintFindings('/v', [missing('머신 러닝')])
    expect(store.dismiss('/v', store.list('/v')[0]!.id)).toBe(true)
    pages = [{ rel: 'wiki/머신 러닝.md', slug: 'wiki/머신 러닝', title: '머신 러닝' }]
    expect(store.listDismissed('/v')).toEqual([])
  })

  it('빠진 페이지 항목이 없으면 페이지 목록을 읽지 않는다', () => {
    const userData = tmp()
    let reads = 0
    const store = createReviewItemStore(
      () => userData,
      () => {
        reads += 1
        return []
      }
    )
    store.addLintFindings('/v', [finding('오래된 내용')])
    store.list('/v')
    store.listDismissed('/v')
    expect(reads).toBe(0)
  })

  it('페이지 목록을 읽지 못하면 정리 없이 저장된 그대로 보인다', () => {
    const userData = tmp()
    const store = createReviewItemStore(
      () => userData,
      () => {
        throw new Error('EACCES')
      }
    )
    store.addLintFindings('/v', [missing('머신 러닝')])
    expect(store.list('/v').map((i) => i.title)).toEqual(['머신 러닝'])
  })
})

describe('무시 되돌리기', () => {
  it('무시한 항목은 목록에서 빠지고, 되돌리면 다시 돌아온다', () => {
    const userData = tmp()
    const store = createReviewItemStore(() => userData)
    store.addVerifyDefects('/v', ['wiki/a.md:3 tab used for indentation'])
    const [item] = store.list('/v')
    expect(store.dismiss('/v', item.id)).toBe(true)
    expect(store.list('/v')).toEqual([])
    expect(store.listDismissed('/v').map((entry) => entry.id)).toEqual([item.id])
    expect(store.restore('/v', item.id)).toBe(true)
    expect(store.list('/v').map((entry) => entry.id)).toEqual([item.id])
    expect(store.listDismissed('/v')).toEqual([])
  })

  it('이미 보이는 항목을 되돌리면 아무것도 바뀌지 않는다', () => {
    const userData = tmp()
    const store = createReviewItemStore(() => userData)
    store.addVerifyDefects('/v', ['wiki/b.md:1 tab used for indentation'])
    const [item] = store.list('/v')
    expect(store.restore('/v', item.id)).toBe(false)
    expect(store.restore('/v', '없는-id')).toBe(false)
  })
})
