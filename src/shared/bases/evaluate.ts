/**
 * `.base`(Obsidian Bases) 파일을 표로 바꾼다 — 읽기 전용.
 * YAML 을 읽어 뷰마다 필터를 걸고 칸을 고르고 줄을 세운다. 우리가 모르는 문법(모르는 함수·
 * table 아닌 뷰·모르는 뷰 설정)을 만나면 그 뷰를 통째로 `unsupported` 로 돌린다 —
 * 조건을 빼고 센 행은 사람을 속인다.
 * 문법 출처: obsidian.md/help/bases/syntax (2026-09-20 확인).
 */
import { parse as parseYaml } from 'yaml'
import { evaluateExpr, isLink, truthy, Unsupported, type BaseNote, type ExprContext } from './expr'
import { currentT } from '../i18n'

export type { BaseNote }

export interface BaseColumn {
  /** 식 그대로 — `file.name`·`status`·`formula.project` */
  key: string
  /** 사람이 볼 칸 이름 — `properties.<키>.displayName` 이 있으면 그것 */
  label: string
}

/** 칸 하나 — 글자와, 갈 곳이 있으면 그 문서의 경로 */
export interface BaseCell {
  text: string
  /** 눌러서 열 문서. 없으면 그냥 글자다 */
  rel?: string
}

export interface BaseRow {
  rel: string
  /** 칸 순서대로 그린 값 */
  cells: BaseCell[]
  /** `groupBy` 로 묶였을 때 이 줄이 든 묶음 이름 */
  group?: string
}

export interface BaseView {
  name: string
  columns: BaseColumn[]
  rows: BaseRow[]
  /** 계산 못 한 이유 — 있으면 행 대신 이것을 보여 준다 */
  unsupported?: string
}

export interface BaseTable {
  views: BaseView[]
  /** 파일 자체를 읽지 못했다 */
  error?: string
  /** 보관함이 너무 커서 앞에서부터 잘라 봤다 — 화면이 사실대로 말하려면 둘 다 필요하다 */
  truncated?: { seen: number; total: number }
}

type Filters = string | { and?: unknown[]; or?: unknown[]; not?: unknown[] }

/** and/or/not 트리를 판정한다 — 모르는 모양이면 Unsupported */
const matches = (filters: unknown, note: BaseNote, context: ExprContext): boolean => {
  if (filters === undefined || filters === null) return true
  if (typeof filters === 'string') return truthy(evaluateExpr(filters, note, context))
  if (Array.isArray(filters)) return filters.every((one) => matches(one, note, context))
  if (typeof filters !== 'object') throw new Unsupported(currentT().bases.filterShape)

  const node = filters as Filters & Record<string, unknown>
  const keys = Object.keys(node)
  const unknown = keys.filter((key) => key !== 'and' && key !== 'or' && key !== 'not')
  if (unknown.length > 0) throw new Unsupported(currentT().bases.unknownFilter(unknown.join(', ')))
  for (const key of keys) {
    const list = node[key]
    if (!Array.isArray(list)) throw new Unsupported(currentT().bases.needsList(key))
    if (key === 'and' && !list.every((one) => matches(one, note, context))) return false
    if (key === 'or' && !list.some((one) => matches(one, note, context))) return false
    if (key === 'not' && list.some((one) => matches(one, note, context))) return false
  }
  return true
}

/** 칸 하나를 사람이 읽을 글자로 — 배열은 쉼표, 위키링크는 글자만, 날짜는 날짜만 */
export const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (isLink(value)) return value.text
  if (Array.isArray(value)) return value.map(cellText).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value).replace(/\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g, (_m, target, alias) =>
    String(alias ?? target)
  )
}

/** `properties` 는 `next_action` 을 `note.next_action` 으로 적는다 — 둘 다 찾아 본다 */
const labelOf = (key: string, properties: Record<string, unknown>): string => {
  const config = properties[key] ?? properties[`note.${key}`]
  const display =
    config && typeof config === 'object' ? (config as { displayName?: unknown }).displayName : null
  if (typeof display === 'string' && display !== '') return display
  return key === 'file.name'
    ? currentT().bases.nameColumn
    : key.replace(/^(note|file|formula)\./, '')
}

/**
 * 표에서 `file.name` 칸은 확장자를 뺀 이름으로 보인다 — Obsidian 표와 같은 모양이다.
 * `link()` 이 만든 값과 `file.name` 은 갈 곳을 들고 있어 눌러서 열 수 있다.
 */
const cellOf = (key: string, note: BaseNote, context: ExprContext): BaseCell => {
  if (key === 'file.name') return { text: note.basename, rel: note.rel }
  const value = evaluateExpr(key, note, context)
  return isLink(value) ? { text: value.text, rel: value.rel } : { text: cellText(value) }
}

/**
 * 이 앱이 읽는 뷰 키. 이 밖이 하나라도 있으면 그 뷰는 계산하지 않는다 —
 * 모르는 설정을 조용히 무시하면 다른 표가 맞는 것처럼 보인다.
 * 모양만 바꾸는 키(`columnSize`·`rowHeight`)는 행 집합도 순서도 건드리지 않아 그냥 넘긴다 —
 * Obsidian 에서 칸 너비를 한 번 끌면 그 파일에 `columnSize` 가 적히고, 그 뒤로 표를 못 그리면 안 된다.
 */
const VIEW_KEYS = new Set([
  'type',
  'name',
  'order',
  'limit',
  'filters',
  'sort',
  'groupBy',
  'columnSize',
  'rowHeight'
])

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

interface SortKey {
  property: string
  descending: boolean
}

/** `direction` 은 ASC·DESC 만 쓴다 — 다른 글자는 뜻을 모르니 뷰를 멈춘다 */
const directionOf = (value: unknown, where: string): boolean => {
  if (value === undefined || value === null) return false
  const text = String(value).toUpperCase()
  if (text === 'ASC') return false
  if (text === 'DESC') return true
  throw new Unsupported(currentT().bases.unknownDirection(where, String(value)))
}

/** `sort:` 를 읽는다 — `- property: x` + `direction` 만 안다 */
const sortKeysOf = (raw: unknown): SortKey[] => {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new Unsupported(currentT().bases.needsList('sort'))
  return raw.map((one) => {
    if (typeof one === 'string') return { property: one, descending: false }
    const node = asRecord(one)
    const extra = Object.keys(node).filter((key) => key !== 'property' && key !== 'direction')
    if (extra.length > 0)
      throw new Unsupported(currentT().bases.unknownSetting('sort', extra.join(', ')))
    const property = node['property']
    if (typeof property !== 'string') throw new Unsupported(currentT().bases.needsProperty('sort'))
    return { property, descending: directionOf(node['direction'], 'sort') }
  })
}

/** `groupBy:` 를 읽는다 — 묶을 속성 하나 */
const groupKeyOf = (raw: unknown): SortKey | null => {
  if (raw === undefined || raw === null) return null
  if (typeof raw === 'string') return { property: raw, descending: false }
  const node = asRecord(raw)
  const extra = Object.keys(node).filter((key) => key !== 'property' && key !== 'direction')
  if (extra.length > 0)
    throw new Unsupported(currentT().bases.unknownSetting('groupBy', extra.join(', ')))
  const property = node['property']
  if (typeof property !== 'string') throw new Unsupported(currentT().bases.needsProperty('groupBy'))
  return { property, descending: directionOf(node['direction'], 'groupBy') }
}

/** 줄 세우기에 쓸 수·글자 — 날짜는 밀리초, 링크는 글자. 나머지는 견줄 수 없다 */
const sortable = (value: unknown): number | string | null => {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.getTime()
  if (isLink(value)) return value.text
  if (typeof value === 'number' || typeof value === 'string') return value
  return null
}

/** 빈 값은 늘 뒤로 — 방향을 뒤집어도 빈 줄이 위로 올라오지 않는다 */
const rank = (left: unknown, right: unknown, descending: boolean): number => {
  const l = sortable(left)
  const r = sortable(right)
  if (l === null && r === null) return 0
  if (l === null) return 1
  if (r === null) return -1
  const same =
    typeof l === 'number' && typeof r === 'number'
      ? l - r
      : String(l).localeCompare(String(r), 'ko')
  return descending ? -same : same
}

/**
 * `.base` 원문과 보관함 노트로 뷰별 표를 만든다.
 * `notes` 는 이미 경로순이다 — `sort` 가 없으면 그 순서를 그대로 쓴다.
 */
export const evaluateBase = (text: string, notes: BaseNote[]): BaseTable => {
  let doc: Record<string, unknown>
  try {
    doc = asRecord(parseYaml(text))
  } catch (error) {
    return { views: [], error: currentT().bases.unreadable((error as Error).message) }
  }

  const properties = asRecord(doc['properties'])
  const rawFormulas = asRecord(doc['formulas'])
  const formulas: Record<string, string> = {}
  for (const [name, source] of Object.entries(rawFormulas)) {
    if (typeof source === 'string') formulas[name] = source
  }
  const context: ExprContext = { formulas }

  const rawViews = Array.isArray(doc['views']) ? doc['views'] : []
  if (rawViews.length === 0) return { views: [], error: currentT().bases.noTables }

  const views: BaseView[] = rawViews.map((raw, index) => {
    const view = asRecord(raw)
    const name =
      typeof view['name'] === 'string' ? view['name'] : currentT().bases.tableN(index + 1)
    const order = Array.isArray(view['order'])
      ? view['order'].filter((key): key is string => typeof key === 'string')
      : []
    const columns: BaseColumn[] = (order.length > 0 ? order : ['file.name']).map((key) => ({
      key,
      label: labelOf(key, properties)
    }))

    if (view['type'] !== 'table') {
      return {
        name,
        columns,
        rows: [],
        unsupported: currentT().bases.tablesOnly(
          String(view['type'] ?? currentT().bases.unknownViewType)
        )
      }
    }
    const unknownKeys = Object.keys(view).filter((key) => !VIEW_KEYS.has(key))
    if (unknownKeys.length > 0) {
      return {
        name,
        columns,
        rows: [],
        unsupported: currentT().bases.unknownViewKeys(unknownKeys.join(', '))
      }
    }

    try {
      const sortKeys = sortKeysOf(view['sort'])
      const groupKey = groupKeyOf(view['groupBy'])
      const kept = notes.filter(
        (note) => matches(doc['filters'], note, context) && matches(view['filters'], note, context)
      )

      // 정렬 값은 노트마다 한 번만 센다 — 비교마다 다시 풀면 수식이 행 수의 제곱만큼 돈다
      const keyed = kept.map((note) => ({
        note,
        group: groupKey === null ? null : evaluateExpr(groupKey.property, note, context),
        sorts: sortKeys.map((key) => evaluateExpr(key.property, note, context))
      }))
      if (groupKey !== null || sortKeys.length > 0) {
        keyed.sort((a, b) => {
          if (groupKey !== null) {
            const byGroup = rank(a.group, b.group, groupKey.descending)
            if (byGroup !== 0) return byGroup
          }
          for (let i = 0; i < sortKeys.length; i += 1) {
            const by = rank(a.sorts[i], b.sorts[i], sortKeys[i]!.descending)
            if (by !== 0) return by
          }
          return 0
        })
      }

      // 음수·소수 limit 은 slice 의미를 뒤집는다 — 유한한 수만 0 이상 정수로 읽는다
      const rawLimit = view['limit']
      const limit =
        typeof rawLimit === 'number' && Number.isFinite(rawLimit)
          ? Math.max(0, Math.floor(rawLimit))
          : keyed.length
      const rows = keyed.slice(0, limit).map(({ note, group }) => ({
        rel: note.rel,
        cells: columns.map((column) => cellOf(column.key, note, context)),
        ...(groupKey === null ? {} : { group: cellText(group) })
      }))
      return { name, columns, rows }
    } catch (error) {
      if (error instanceof Unsupported) {
        return {
          name,
          columns,
          rows: [],
          unsupported: currentT().bases.seeInObsidian(error.message)
        }
      }
      throw error
    }
  })

  return { views }
}
