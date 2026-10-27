// 중복 페이지 합치기 — 남길 페이지·지울 페이지를 고르고, 합친 글과 링크를 고친 글을 만든다. 순수 함수:
// 파일은 main(`merge-service.ts`)이 쓰고 커밋한다. 합친 본문은 엔진 제안이고 여기서는 손대지 않는다.
import {
  WIKILINK_RE,
  createLinkResolver,
  frontmatterLength,
  parseWikiPage,
  type LinkResolver
} from './parse'
import { setProperty } from './properties'
import { currentT } from '../i18n'

export type MergePage = { rel: string; slug: string; title: string; text: string }

/** 합칠 수 있는 경로 — `wiki/` 아래 .md, 조각에 `.`·`..`·빈칸 없음(`wiki/../VAULT_RULES.md` 같은 우회를 막는다) */
export const isWikiPagePath = (rel: string): boolean =>
  /^wiki\/.+\.md$/.test(rel) &&
  rel.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')

/** 맨 위 속성 블록을 뗀 본문 — 속성이 깨져 있어도 블록 모양이면 뗀다(합친 글의 속성은 남길 페이지 것을 쓴다) */
export const bodyOf = (text: string): string => text.slice(frontmatterLength(text))

/** 화면·커밋 제목에 쓰는 페이지 이름 — 경로의 마지막 조각 */
export const pageName = (rel: string): string => rel.replace(/\.md$/i, '').split('/').pop() ?? rel

export type MergeEdit = { rel: string; text: string; count: number }

export type MergePlan = {
  /** 남길 페이지의 새 글 — 속성 + 합친 본문, aliases 에 옛 이름들 */
  keepText: string
  /** 링크를 고친 다른 문서 — 고칠 링크가 있는 것만 */
  edits: MergeEdit[]
}

/** 가린 자리 안의 링크는 링크가 아니다 — 인라인 코드·마크다운 링크·URL. 위치를 지키려고 같은 길이로 가린다 */
const maskLine = (line: string): string =>
  line
    .replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
    .replace(/\[[^\]]*\]\([^)]*\)/g, (m) => ' '.repeat(m.length))
    .replace(/https?:\/\/\S+/g, (m) => ' '.repeat(m.length))

/**
 * `dropRel` 로 풀리는 위키링크를 `keepName` 으로 바꾼다 — `#제목`·`|별칭`·`![[…]]` 는 그대로 둔다.
 * 코드 블록(``` ~~~ — 연 표식과 같은 문자로 같거나 긴 줄이 닫는다)·인라인 코드·URL 안은 건드리지 않는다.
 * 표 안의 `[[이름\|별칭]]` 은 이름 끝의 `\` 를 떼고 풀고, 바꿀 때는 그대로 둔다.
 */
export const rewriteLinks = (
  text: string,
  resolve: LinkResolver,
  dropRel: string,
  keepName: string
): { text: string; count: number } => {
  let count = 0
  let fence: string | null = null
  // 줄마다 새로 만들면 수천 번 컴파일한다 — 호출당 한 번이면 된다.
  // matchAll 은 lastIndex 를 읽기만 하고, 이 정규식은 여기서만 쓰므로 0 에서 시작한다
  const wikilink = new RegExp(WIKILINK_RE.source, 'g')
  const lines = text.split('\n').map((line) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence === null && !marker && !line.includes('[[')) return line
    if (fence !== null) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null
      return line
    }
    if (marker) {
      fence = marker
      return line
    }
    const masked = maskLine(line)
    let out = ''
    let at = 0
    for (const match of masked.matchAll(wikilink)) {
      const target = match[1]!.replace(/\\$/, '')
      if (resolve(target.trim()).rel !== dropRel) continue
      const start = match.index + 2
      out += line.slice(at, start) + keepName
      at = start + target.length
      count += 1
    }
    return out + line.slice(at)
  })
  return { text: lines.join('\n'), count }
}

const linksTo = (docs: MergePage[], resolve: LinkResolver, rel: string): number =>
  docs.reduce(
    (sum, doc) => (doc.rel === rel ? sum : sum + rewriteLinks(doc.text, resolve, rel, '').count),
    0
  )

/** 남길 페이지 — 더 많이 가리켜지는 쪽(고칠 링크가 적다), 같으면 글이 긴 쪽, 그것도 같으면 경로순 앞 */
export const pickKeep = (
  a: MergePage,
  b: MergePage,
  docs: MergePage[]
): { keep: MergePage; drop: MergePage } => {
  const resolve = createLinkResolver(docs)
  const order =
    linksTo(docs, resolve, b.rel) - linksTo(docs, resolve, a.rel) ||
    b.text.length - a.text.length ||
    a.rel.localeCompare(b.rel)
  return order <= 0 ? { keep: a, drop: b } : { keep: b, drop: a }
}

const listOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string' && value.trim() !== ''
      ? [value]
      : []

/** 합친 결과 — 남길 페이지의 속성은 그대로 두고 본문만 `body` 로, aliases 에 지울 페이지의 제목·별칭을 더한다 */
export const planMerge = ({
  keep,
  drop,
  docs,
  body
}: {
  keep: MergePage
  drop: MergePage
  /** 링크를 고칠 문서들 — 두 페이지를 포함해도 된다(지울 페이지는 건너뛴다) */
  docs: MergePage[]
  body: string
}): MergePlan => {
  const resolve = createLinkResolver(docs)
  // 남길 페이지를 거는 이름 — 지울 페이지를 뺀 나머지에서 basename 이 하나뿐이면 basename, 겹치면 경로형
  const baseOf = (slug: string): string =>
    slug
      .slice(slug.lastIndexOf('/') + 1)
      .normalize('NFC')
      .toLowerCase()
  const base = keep.slug.slice(keep.slug.lastIndexOf('/') + 1)
  const twins = docs.filter((doc) => doc.rel !== drop.rel && baseOf(doc.slug) === baseOf(keep.slug))
  const keepName = twins.length === 1 ? base : keep.slug

  const head = keep.text.slice(0, frontmatterLength(keep.text))
  const aliases = listOf(parseWikiPage(keep.rel, keep.text).frontmatter?.aliases)
  const dropNames = [drop.title, ...listOf(parseWikiPage(drop.rel, drop.text).frontmatter?.aliases)]
  const added = dropNames.filter((name) => name !== keep.title && !aliases.includes(name))
  // 합친 본문은 엔진 답이라 LF 다 — 남길 파일이 CRLF 면 그 줄바꿈에 맞춘다
  const eol = keep.text.includes('\r\n') ? '\r\n' : '\n'
  let merged = head + body.replace(/\r?\n/g, eol)
  if (added.length > 0) {
    // 옛 이름이 남지 않으면 그 이름의 링크·검색이 끊긴다 — 못 넣으면 합치지 않는다
    const edit = setProperty(merged, 'aliases', [...new Set([...aliases, ...added])])
    if (!edit.ok) throw new Error(currentT().wiki.mergeAliasFailed(edit.reason))
    merged = edit.text
  }

  const edits: MergeEdit[] = []
  for (const doc of docs) {
    if (doc.rel === drop.rel || doc.rel === keep.rel) continue
    const result = rewriteLinks(doc.text, resolve, drop.rel, keepName)
    if (result.count > 0) edits.push({ rel: doc.rel, ...result })
  }
  return { keepText: rewriteLinks(merged, resolve, drop.rel, keepName).text, edits }
}
