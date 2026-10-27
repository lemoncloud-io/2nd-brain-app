// 역링크 — "이 페이지를 가리키는 페이지" 의 정본.
// 입력은 main 이 push 하는 위키 목록(entry.links) 그대로다. 별도 인덱스·diff 갱신 없이 목록마다 통째로 다시 만든다:
// 조회표를 한 번 만들고 링크마다 O(1) 이라 O(N+E) — 정본이 하나면 지워진 페이지의 링크가 남을 길이 없다.
// graph.ts 의 간선은 레이아웃용 가중치라 여기서 읽지 않는다.
import { createLinkResolver, type LinkResolver, type PageRef } from './parse'

export type BacklinkSource = { rel: string; title: string }

export type BacklinkEntry = PageRef & {
  title: string
  links: { target: string; vaultFile?: boolean }[]
}

/** rel → 그 페이지를 가리키는 페이지들(제목순, 자기 링크 제외, 한 페이지는 한 번) */
export function buildBacklinks(entries: BacklinkEntry[]): Map<string, BacklinkSource[]> {
  const resolve = createLinkResolver(entries.map((e): PageRef => ({ rel: e.rel, slug: e.slug })))
  const seen = new Map<string, Set<string>>()
  const out = new Map<string, BacklinkSource[]>()
  for (const from of entries) {
    for (const link of from.links) {
      if (link.vaultFile) continue
      const to = resolve(link.target).rel
      if (to === null || to === from.rel) continue
      const sources = seen.get(to) ?? new Set<string>()
      if (sources.has(from.rel)) continue
      sources.add(from.rel)
      seen.set(to, sources)
      const list = out.get(to) ?? []
      list.push({ rel: from.rel, title: from.title })
      out.set(to, list)
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.title.localeCompare(b.title, 'ko'))
  return out
}

export type Connection = BacklinkSource & {
  /** out = 이 페이지가 가리킨다 · in = 이 페이지를 가리킨다 · both = 서로 */
  way: 'out' | 'in' | 'both'
}

/**
 * 이 페이지와 이어진 페이지 — 가리킨 곳과 가리켜 온 곳을 한 번씩(제목순). 그래프의 이웃과 같은 묶음이다.
 * 목록에 없는 페이지·풀리지 않는 링크·볼트 파일 링크·자기 링크는 세지 않는다
 */
export function pageConnections(rel: string, entries: BacklinkEntry[]): Connection[] {
  const refs = entries.map((e): PageRef => ({ rel: e.rel, slug: e.slug }))
  return connectionsOf(rel, entries, {
    map: buildBacklinks(entries),
    resolve: createLinkResolver(refs),
    titles: new Map(entries.map((e) => [e.rel, e.title]))
  })
}

/** 목록마다 한 번 만든 조회표 — 한 페이지 조회에 전체맵을 다시 짓지 않는다.
 * entries와 index는 같은 pages 스냅샷에서 와야 한다(낡은 표에 새 목록을 물리면 답이 어긋난다) */
export type ConnectionIndex = {
  map: ReturnType<typeof buildBacklinks>
  resolve: LinkResolver
  titles: Map<string, string>
}

export function connectionsOf(
  rel: string,
  entries: BacklinkEntry[],
  index: ConnectionIndex
): Connection[] {
  const self = entries.find((e) => e.rel === rel)
  if (!self) return []
  const out = new Set<string>()
  for (const link of self.links) {
    if (link.vaultFile) continue
    const to = index.resolve(link.target).rel
    if (to !== null && to !== rel) out.add(to)
  }
  const into = new Set((index.map.get(rel) ?? []).map((s) => s.rel))
  return [...new Set([...out, ...into])]
    .map((other): Connection => ({
      rel: other,
      title: index.titles.get(other) ?? other,
      way: out.has(other) ? (into.has(other) ? 'both' : 'out') : 'in'
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ko'))
}
