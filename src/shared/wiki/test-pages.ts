// 검색 테스트 공용 픽스처 — 문서 하나를 세 줄로 만든다. 테스트에서만 import 한다.
import type { BacklinkEntry } from './backlinks'
import type { SearchablePage } from './search'

/** `links` = 본문의 `[[링크]]` 대상 이름 — 링크 이웃을 보는 테스트만 준다 */
export const page = (
  rel: string,
  title: string,
  body: string,
  links: string[] = []
): SearchablePage & Pick<BacklinkEntry, 'links'> => ({
  rel,
  slug: rel.replace(/^wiki\//, '').replace(/\.md$/, ''),
  title,
  body,
  links: links.map((target) => ({ target }))
})
