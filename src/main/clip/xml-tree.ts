// zip 안 XML(HWPX·pptx)을 걷는 공용 조각 — fast-xml-parser 의 preserveOrder 트리.
import { XMLParser } from 'fast-xml-parser'

/** preserveOrder 출력 — 노드 = { 태그: 자식[], ':@'?: 속성 } 또는 { '#text': 글자 } */
export type XmlNode = Record<string, XmlNode[] | string | Record<string, string>>

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  // "1" 을 숫자로, 앞뒤 공백을 지우는 기본값은 글자 추출에 해롭다
  parseTagValue: false,
  trimValues: false
})

/** OWPML·OOXML 은 DOCTYPE 을 쓰지 않는다 — 엔티티 팽창(billion laughs)은 이 한 줄로 막는다 */
export const assertNoDoctype = (xml: string, what: string): void => {
  if (/<!DOCTYPE/i.test(xml)) throw new Error(`${what} has a DOCTYPE`)
}

export const parseXml = (xml: string, what: string): XmlNode[] => {
  assertNoDoctype(xml, what)
  return parser.parse(xml) as XmlNode[] // preserveOrder 출력은 언제나 노드 배열이다 — parse 반환 타입은 any
}

export const childrenOf = (node: XmlNode, tag: string): XmlNode[] => {
  const value = node[tag]
  return Array.isArray(value) ? value : []
}

export const tagOf = (node: XmlNode): string => Object.keys(node).find((key) => key !== ':@') ?? ''

export const attrOf = (node: XmlNode, name: string): string | undefined => {
  const attrs = node[':@']
  return attrs && !Array.isArray(attrs) && typeof attrs === 'object' ? attrs[name] : undefined
}

/** 태그 경로를 따라 내려간 첫 노드 — 없으면 undefined */
export const firstPath = (nodes: XmlNode[], ...path: string[]): XmlNode | undefined => {
  let level = nodes
  let found: XmlNode | undefined
  for (const tag of path) {
    found = level.find((node) => tagOf(node) === tag)
    if (!found) return undefined
    level = childrenOf(found, tag)
  }
  return found
}
