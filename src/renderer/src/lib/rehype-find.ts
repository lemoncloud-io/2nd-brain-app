// 리더 찾기 형광 — 렌더 *전* hast 텍스트 노드를 일치 경계에서 쪼개 <mark data-hit> 로 감싼다.
// 렌더 뒤 DOM 을 만지면 React 가 다음 렌더에서 그 노드를 잃는다(계획 07 RISK). 의존성 없이 직접 순회.
// 번호는 여기서 매기지 않는다 — "열린 항목만" 이 접은 블록은 그려지지 않아 hast 순서와 화면 순서가 다르다.
// 총계·지금 자리는 그려진 mark 를 화면 순서로 센다(`lib/find-dom.ts`).
// 인라인 서식을 가로지르는 일치(**굵**게 안의 "굵게")는 못 찾는다 — 노드 하나 안에서만 센다.
import { findInText } from '../../../shared/wiki/find'

type Text = { type: 'text'; value: string }
type Node = Text | { type: string; children?: Node[] }

export type FindOptions = { query: string }

const isText = (n: Node): n is Text => n.type === 'text'

export const rehypeFind =
  ({ query }: FindOptions) =>
  (tree: Node): void => {
    if (query === '') return
    const walk = (node: Node): void => {
      if (isText(node) || node.children === undefined) return
      const next: Node[] = []
      for (const child of node.children) {
        if (!isText(child)) {
          walk(child)
          next.push(child)
          continue
        }
        // 오프셋은 NFC 원문 기준(find.ts) — 같은 정규화로 자른다
        const value = child.value.normalize('NFC')
        const ranges = findInText(value, query)
        if (ranges.length === 0) {
          next.push(child)
          continue
        }
        let cursor = 0
        for (const r of ranges) {
          if (r.start > cursor) next.push({ type: 'text', value: value.slice(cursor, r.start) })
          next.push({
            type: 'element',
            tagName: 'mark',
            properties: { dataHit: '' },
            children: [{ type: 'text', value: value.slice(r.start, r.end) }]
          } as Node)
          cursor = r.end
        }
        if (cursor < value.length) next.push({ type: 'text', value: value.slice(cursor) })
      }
      node.children = next
    }
    walk(tree)
  }
