import { describe, expect, it } from 'vitest'
import type { ReviewItem } from './ipc-contract'
import { sweptReviewItemIds, type SweepPage } from './review-sweep'

const item = (
  id: string,
  kind: string,
  title: string,
  source: ReviewItem['source'] = 'ai-lint'
): ReviewItem => ({
  id,
  source,
  kind,
  title,
  detail: '',
  rel: 'wiki/a.md',
  createdAt: 0,
  dismissed: false
})

const page = (rel: string, title: string): SweepPage => ({
  rel,
  slug: rel.replace(/\.md$/, ''),
  title
})

describe('sweptReviewItemIds', () => {
  it('이름으로 링크가 풀리는 페이지가 생긴 빠진 페이지 항목만 고른다', () => {
    const items = [
      item('m1', 'missing-page', '머신 러닝'),
      item('m2', 'missing-page', '강화학습'),
      item('o1', 'outdated', '머신 러닝')
    ]
    const swept = sweptReviewItemIds(items, [page('wiki/concepts/머신 러닝.md', '머신 러닝')])
    expect([...swept]).toEqual(['m1'])
  })

  it('파일 이름이 달라도 제목이 같으면(공백·대소문자 무시) 생긴 것으로 본다', () => {
    const items = [item('m1', 'missing-page', 'Machine Learning')]
    expect([...sweptReviewItemIds(items, [page('wiki/ml.md', 'machinelearning')])]).toEqual(['m1'])
  })

  it('상관없는 페이지만 생겼으면 아무것도 고르지 않는다', () => {
    const items = [item('m1', 'missing-page', '머신 러닝')]
    expect(sweptReviewItemIds(items, [page('wiki/딥러닝.md', '딥러닝')]).size).toBe(0)
  })

  it('검증 결함과 다른 종류의 AI 점검 항목은 건드리지 않는다', () => {
    const items = [
      item('v1', 'defect', '머신 러닝', 'verify'),
      item('c1', 'contradiction', '머신 러닝'),
      item('s1', 'suggestion', '머신 러닝')
    ]
    expect(sweptReviewItemIds(items, [page('wiki/머신 러닝.md', '머신 러닝')]).size).toBe(0)
  })

  it('/ 가 든 이름은 마지막 조각만 같은 페이지로 정리하지 않는다', () => {
    const items = [item('m1', 'missing-page', 'TCP/IP')]
    expect(sweptReviewItemIds(items, [page('wiki/ip.md', 'IP 주소')]).size).toBe(0)
    expect([...sweptReviewItemIds(items, [page('wiki/tcp-ip.md', 'TCP/IP')])]).toEqual(['m1'])
  })

  it('한글 자모가 풀린 이름(NFD)도 같은 이름으로 본다', () => {
    const items = [item('m1', 'missing-page', '머신러닝'.normalize('NFD'))]
    expect([...sweptReviewItemIds(items, [page('wiki/x.md', '머신러닝')])]).toEqual(['m1'])
  })
})
