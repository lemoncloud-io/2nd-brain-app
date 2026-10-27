// 구조 lint(슬라이스 09) — 결정론적 점검: orphan · broken-link · no-outlinks.
// 의미 점검(모순·오래됨 등)은 별도(슬라이스 13)이고 여기엔 없다.
import { createLinkResolver, type PageRef, type WikiPage } from './parse'
import { currentT } from '../i18n'

export type LintKind = 'orphan' | 'broken-link' | 'no-outlinks'

export type LintFinding =
  | { kind: 'orphan'; rel: string; message: string }
  | { kind: 'broken-link'; rel: string; line: number; target: string; message?: string }
  | { kind: 'no-outlinks'; rel: string; message: string }

export type VerifyOutcomeLite =
  | { status: 'pass' }
  | { status: 'fail'; defects: string[] }
  | { status: 'unavailable'; reason: string }

export type LintReport = { structure: LintFinding[]; verify: VerifyOutcomeLite }

/** orphan 면제 — 진입점·시스템 페이지 */
export const LINT_EXEMPT = ['wiki/INDEX.md', 'wiki/TOPIC_MAP.md', 'wiki/VAULT_MEMORY.md']

/** 고르기에서 안 고른 쪽을 남겨 둔 사본 — 링크가 없는 게 정상이다 */
const KEPT_ASIDE = /-충돌-(내것|팀것)-\d{4}-\d{2}-\d{2}(-\d+)?\.md$/

const exempt = (rel: string): boolean => LINT_EXEMPT.includes(rel) || KEPT_ASIDE.test(rel)

export function lintStructure(pages: WikiPage[]): LintFinding[] {
  const index: PageRef[] = pages.map((p) => ({ rel: p.rel, slug: p.slug }))
  // 링크마다 표를 다시 만들면 N배 — 한 번 만든 조회표를 두 고리에서 같이 쓴다
  const resolve = createLinkResolver(index)

  // broken-link — 조회표에서 못 찾은 대상, 원문 줄 번호 동봉
  const broken: LintFinding[] = []
  for (const page of pages) {
    for (const link of page.links) {
      // 빈 `[[ ]]` 은 못 찾음과 같은 취급이다 — 검색·틈새와 같은 답을 낸다
      if (link.target === '') continue
      // 볼트 파일로 이어진 링크([[projects/x/README]])는 볼트 규칙상 정상이다
      if (!link.vaultFile && resolve(link.target).rel === null) {
        broken.push({
          kind: 'broken-link',
          rel: page.rel,
          line: link.line ?? 1,
          target: link.target
        })
      }
    }
  }

  // 면제 페이지로의 링크도 유효한 들어오는 링크다(면제는 orphan 판정에서만).
  const incoming = new Map<string, number>()
  for (const page of pages) {
    for (const link of page.links) {
      const rel = resolve(link.target).rel
      if (rel) incoming.set(rel, (incoming.get(rel) ?? 0) + 1)
    }
  }

  const findings: LintFinding[] = [...broken]
  for (const page of pages) {
    if (!exempt(page.rel) && (incoming.get(page.rel) ?? 0) === 0) {
      findings.push({ kind: 'orphan', rel: page.rel, message: currentT().wiki.orphan })
    }
    if (!exempt(page.rel) && page.links.length === 0) {
      findings.push({ kind: 'no-outlinks', rel: page.rel, message: currentT().wiki.noOutlinks })
    }
  }
  return findings
}
