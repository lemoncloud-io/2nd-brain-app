// GitHub 주소 둘 — API 와 웹(로그인). 시험은 가짜 서버로 덮는다: `SECOND_BRAIN_GITHUB_API`·`SECOND_BRAIN_GITHUB_WEB`.
// 배포본은 이 환경 변수를 두지 않으므로 늘 github.com 이다.
const base = (value: string | undefined, fallback: string): string =>
  (value ?? fallback).replace(/\/+$/, '')

export const GITHUB_API = base(process.env['SECOND_BRAIN_GITHUB_API'], 'https://api.github.com')
export const GITHUB_WEB = base(process.env['SECOND_BRAIN_GITHUB_WEB'], 'https://github.com')

/** 첫 실행 보관함의 원본 — GitHub 템플릿 저장소(`owner/name`). 시험은 `SECOND_BRAIN_VAULT_TEMPLATE` 로 덮는다 */
export const VAULT_TEMPLATE_REPO =
  process.env['SECOND_BRAIN_VAULT_TEMPLATE'] ?? 'lemoncloud-io/2nd-brain-template'
