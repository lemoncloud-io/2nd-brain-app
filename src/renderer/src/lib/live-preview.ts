// 라이브 미리보기 — 한 화면에서 읽고 쓴다(Obsidian live preview).
// 커서가 없는 줄은 마크다운 기호(#·**·`·[[ ]]·> ·- [ ])를 숨기고 제목·링크·체크박스·그림을 그 자리에 그린다.
// 커서가 선 줄만 원문이 드러난다 — 고칠 곳은 원문으로, 나머지는 읽는 모양으로.
// 맨 위 속성 블록은 `속성 N개 · 펼치기` 한 줄로 접고, 커서가 들어가면 원문을 펼친다.
import { syntaxTree } from '@codemirror/language'
import {
  EditorState,
  type Extension,
  Facet,
  RangeSetBuilder,
  StateEffect,
  StateField
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from '@codemirror/view'
import {
  WIKILINK_RE,
  createLinkResolver,
  resolveLink,
  type PageRef
} from '../../../shared/wiki/parse'
import { fileKind, vaultUrl } from '../../../shared/vault-file-types'
import { getLanguage, getT, onLanguageChange } from './i18n'
import type { Language } from '../../../shared/language'

export interface LivePreviewConfig {
  index: PageRef[]
  /** ⌘/Ctrl+클릭한 위키 링크 — 볼트 경로로 풀린 것만 온다 */
  onNavigate: (rel: string) => void
  onOpenExternal: (url: string) => void
}

export const livePreviewConfig = Facet.define<LivePreviewConfig, LivePreviewConfig | null>({
  combine: (values) => values[values.length - 1] ?? null
})

/** 문서 첫머리 속성 블록(`---` … `---`)의 끝 — 없으면 0. 이 구간은 원문 그대로 둔다 */
export const frontmatterEnd = (text: string): number => {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return 0
  const close = /\r?\n---[ \t]*(\r?\n|$)/g
  close.lastIndex = 3
  const m = close.exec(text)
  return m === null ? 0 : m.index + m[0].length
}

/**
 * 리더가 스크롤해 둔 비율(0~1)에 해당하는 본문 줄의 시작 위치 — 편집기를 읽던 자리에서 연다.
 * 리더는 속성 블록을 뺀 본문을 그리므로 본문 줄 수로 나눈다(리더의 `scrollToSourceLine` 과 같은 근사).
 * 비율이 없으면 본문 첫 줄(속성 블록 바로 뒤).
 */
export const bodyPosAt = (text: string, ratio?: number): number => {
  const start = frontmatterEnd(text)
  if (ratio === undefined || !(ratio > 0)) return start
  const lines = text.slice(start).split('\n')
  const target = Math.round(Math.min(ratio, 1) * (lines.length - 1))
  let pos = start
  for (let n = 0; n < target; n += 1) pos += lines[n].length + 1
  return pos
}

const isRemote = (url: string): boolean => /^(https?:)?\/\//.test(url) || url.startsWith('data:')
const embedUrl = (target: string): string => (isRemote(target) ? target : vaultUrl(target.trim()))

// 위젯 DOM 은 한 번 만들면 문서가 바뀔 때까지 그대로다 — 화면 언어가 바뀌면 이 효과로 장식을 다시 짓고,
// 위젯은 언어를 들고 있어 eq 가 달라져 DOM 을 새로 만든다
const languageChanged = StateEffect.define<null>()

const hasLanguageChange = (
  transactions: readonly { effects: readonly StateEffect<unknown>[] }[]
): boolean => transactions.some((tr) => tr.effects.some((e) => e.is(languageChanged)))

const languageRefresh = ViewPlugin.define((view) => {
  const off = onLanguageChange(() => view.dispatch({ effects: languageChanged.of(null) }))
  return { destroy: off }
})

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly at: number,
    readonly language: Language = getLanguage()
  ) {
    super()
  }
  eq(other: CheckboxWidget): boolean {
    return (
      other.checked === this.checked && other.at === this.at && other.language === this.language
    )
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.className = 'cm-lp-task'
    box.setAttribute('aria-label', this.checked ? getT().doc.taskUndone : getT().doc.taskDone)
    box.addEventListener('click', (e) => {
      e.preventDefault()
      // `[ ]` 의 가운데 글자 하나만 바꾼다 — 줄의 나머지는 그대로
      view.dispatch({
        changes: { from: this.at + 1, to: this.at + 2, insert: this.checked ? ' ' : 'x' }
      })
    })
    // 누를 자리는 24px — 상자는 글자 크기 그대로 두고 둘레의 label 이 받는다(누르면 상자 클릭이 된다)
    const hit = document.createElement('label')
    hit.className = 'cm-lp-task-hit'
    hit.addEventListener('mousedown', (e) => e.preventDefault())
    hit.append(box)
    return hit
  }
  ignoreEvent(): boolean {
    return false
  }
}

class BulletWidget extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const dot = document.createElement('span')
    dot.className = 'cm-lp-bullet'
    dot.textContent = '•'
    return dot
  }
}

class RuleWidget extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const hr = document.createElement('span')
    hr.className = 'cm-lp-hr'
    return hr
  }
}

class EmbedWidget extends WidgetType {
  constructor(
    readonly target: string,
    readonly alt: string
  ) {
    super()
  }
  eq(other: EmbedWidget): boolean {
    return other.target === this.target && other.alt === this.alt
  }
  toDOM(): HTMLElement {
    const url = embedUrl(this.target)
    if (isRemote(this.target) || fileKind(this.target) === 'image') {
      const img = document.createElement('img')
      img.src = url
      img.alt = this.alt
      img.className = 'cm-lp-image'
      img.setAttribute('data-testid', 'lp-image')
      return img
    }
    // 그림이 아닌 임베드는 파일 이름으로 — 리더와 같은 규칙
    const chip = document.createElement('span')
    chip.className = 'cm-lp-embed'
    chip.textContent = this.target.split('/').pop() ?? this.target
    return chip
  }
}

// 접은 속성 블록 — 누르면 커서를 블록 안에 두어 원문을 펼친다(글로 돌아가면 다시 접힌다)
class PropertiesWidget extends WidgetType {
  constructor(
    readonly count: number,
    readonly inside: number,
    readonly language: Language = getLanguage()
  ) {
    super()
  }
  eq(other: PropertiesWidget): boolean {
    return (
      other.count === this.count && other.inside === this.inside && other.language === this.language
    )
  }
  toDOM(view: EditorView): HTMLElement {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'cm-lp-props'
    chip.setAttribute('data-testid', 'lp-properties')
    chip.textContent = getT().doc.propertiesChip(this.count)
    // 글 칸 안의 단추라 Tab 으로는 오지 않는다 — 키보드는 본문 첫 줄에서 ↑ 로 펼친다
    chip.title = getT().doc.propertiesChipHint
    chip.setAttribute('aria-expanded', 'false')
    chip.addEventListener('mousedown', (e) => e.preventDefault())
    chip.addEventListener('click', (e) => {
      e.preventDefault()
      view.dispatch({ selection: { anchor: this.inside } })
      view.focus()
    })
    return chip
  }
  ignoreEvent(): boolean {
    return true
  }
}

/** foldProperties 가 매 트랜잭션마다 스캔하는 상한 — 이 안에서 닫히면 한 번에 끝난다 */
const FRONTMATTER_SCAN_LIMIT = 20000
/** 닫힘이 상한을 넘긴 큰 속성 블록을 위한 확장 상한 — 이 안에서도 못 찾으면 접지 않는다 */
const FRONTMATTER_SCAN_MAX = 200000

const frontmatterEndIn = (state: EditorState): number => {
  const first = state.doc.sliceString(0, Math.min(state.doc.length, FRONTMATTER_SCAN_LIMIT))
  const end = frontmatterEnd(first)
  if (end !== 0 || state.doc.length <= FRONTMATTER_SCAN_LIMIT) return end
  if (!first.startsWith('---\n') && !first.startsWith('---\r\n')) return 0
  return frontmatterEnd(state.doc.sliceString(0, Math.min(state.doc.length, FRONTMATTER_SCAN_MAX)))
}

/** 속성 이름 수 — 들여 쓴 줄(목록 값)·주석·빈 줄은 세지 않는다 */
const propertyCount = (block: string): number =>
  block
    .split(/\r?\n/)
    .slice(1, -1)
    .filter((line) => /^[^\s#-][^:]*:/.test(line)).length

// 줄을 넘는 바꾸기 장식은 플러그인이 아니라 상태 필드가 내야 한다(CodeMirror 규칙)
const foldProperties = (state: EditorState): DecorationSet => {
  const end = frontmatterEndIn(state)
  if (end === 0) return Decoration.none
  // 닫는 `---` 줄 끝까지 — 줄바꿈은 남겨 본문이 제 줄에서 시작한다
  const to = state.doc.lineAt(end - 1).to
  if (state.selection.ranges.some((r) => r.from <= to)) return Decoration.none
  const widget = new PropertiesWidget(
    propertyCount(state.doc.sliceString(0, to)),
    state.doc.line(2).from
  )
  return Decoration.set([Decoration.replace({ widget }).range(0, to)])
}

const propertiesFold = StateField.define<DecorationSet>({
  create: foldProperties,
  update: (deco, tr) =>
    tr.docChanged || tr.selection || hasLanguageChange([tr]) ? foldProperties(tr.state) : deco,
  provide: (field) => EditorView.decorations.from(field)
})

// 접힌 채로 지우기가 블록에 닿으면(본문 첫 줄에서 ⌫ — 닫는 `---` 뒤 줄바꿈) 지우지 않고 펼친다.
// 보이지 않는 글을 지우면 `---본문` 이 되어 속성 블록이 깨진다
const guardFoldedDelete = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.isUserEvent('delete')) return tr
  if (tr.startState.field(propertiesFold, false)?.size !== 1) return tr
  const state = tr.startState
  const to = state.doc.lineAt(frontmatterEndIn(state) - 1).to
  let hit = false
  tr.changes.iterChangedRanges((fromA) => {
    if (fromA <= to) hit = true
  })
  return hit ? { selection: { anchor: state.doc.line(2).from }, scrollIntoView: true } : tr
})

const frontmatterLineDecos = (state: EditorState): DecorationSet => {
  const end = frontmatterEndIn(state)
  if (end === 0) return Decoration.none
  const line = Decoration.line({ class: 'cm-lp-fm' })
  const last = state.doc.lineAt(end - 1).number
  return Decoration.set(
    Array.from({ length: last }, (_, n) => line.range(state.doc.line(n + 1).from))
  )
}

/**
 * 속성 블록 줄을 흐린 고정폭으로 — 꾸밈 기호 보기(라이브 미리보기 끔)에서도 켠다.
 * 기본 구문 색(구분선·제목 모양 키)은 어두운 면에서 거의 안 보인다(`main.css` `.cm-lp-fm`)
 */
export const frontmatterLines = StateField.define<DecorationSet>({
  create: frontmatterLineDecos,
  update: (deco, tr) => (tr.docChanged ? frontmatterLineDecos(tr.state) : deco),
  provide: (field) => EditorView.decorations.from(field)
})

const hide = Decoration.replace({})
const mark = (cls: string, attrs?: Record<string, string>): Decoration =>
  Decoration.mark({ class: cls, ...(attrs ? { attributes: attrs } : {}) })

interface Pending {
  from: number
  to: number
  deco: Decoration
}

/** 선택이 걸친 줄 번호들 — 이 줄들은 원문을 보인다 */
const activeLines = (state: EditorState): Set<number> => {
  const lines = new Set<number>()
  for (const r of state.selection.ranges) {
    const first = state.doc.lineAt(r.from).number
    const last = state.doc.lineAt(r.to).number
    for (let n = first; n <= last; n += 1) lines.add(n)
  }
  return lines
}

const INLINE_MARKS: Record<string, string> = {
  Emphasis: 'cm-lp-em',
  StrongEmphasis: 'cm-lp-strong',
  InlineCode: 'cm-lp-code',
  Strikethrough: 'cm-lp-strike'
}
const HIDDEN_MARKS = new Set(['EmphasisMark', 'CodeMark', 'StrikethroughMark'])
const CODE_NODES = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText'])

const build = (view: EditorView): DecorationSet => {
  const { state } = view
  const config = state.facet(livePreviewConfig)
  // 링크마다 index 전체를 다시 훑으면 볼트 크기에 비례해 느려진다 — 조회표를 한 번 만든다
  const resolveRef = config ? createLinkResolver(config.index) : null
  const active = activeLines(state)
  const fmEnd = frontmatterEndIn(state)
  const out: Pending[] = []
  const lineOf = (pos: number): number => state.doc.lineAt(pos).number
  const isActive = (from: number, to: number): boolean => {
    for (let n = lineOf(from); n <= lineOf(to); n += 1) if (active.has(n)) return true
    return false
  }
  const codeRanges: [number, number][] = []

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.to <= fmEnd) return false
        const name = node.name
        if (CODE_NODES.has(name)) codeRanges.push([node.from, node.to])
        const heading = /^(ATX|Setext)Heading(\d)$/.exec(name)
        if (heading) {
          const line = state.doc.lineAt(node.from)
          out.push({
            from: line.from,
            to: line.from,
            deco: Decoration.line({ class: `cm-lp-h cm-lp-h${heading[2]}` })
          })
          return true
        }
        if (name === 'FencedCode') {
          for (let n = lineOf(node.from); n <= lineOf(node.to); n += 1) {
            const line = state.doc.line(n)
            out.push({
              from: line.from,
              to: line.from,
              deco: Decoration.line({ class: 'cm-lp-codeblock' })
            })
          }
          return false
        }
        if (name === 'Blockquote') {
          for (let n = lineOf(node.from); n <= lineOf(node.to); n += 1) {
            const line = state.doc.line(n)
            out.push({
              from: line.from,
              to: line.from,
              deco: Decoration.line({ class: 'cm-lp-quote' })
            })
          }
          return true
        }
        const inline = INLINE_MARKS[name]
        if (inline && node.to > node.from)
          out.push({ from: node.from, to: node.to, deco: mark(inline) })

        const shown = isActive(node.from, node.to)
        if (shown) return true
        if (name === 'HeaderMark') {
          const after = state.doc.sliceString(node.to, node.to + 1)
          out.push({ from: node.from, to: after === ' ' ? node.to + 1 : node.to, deco: hide })
        } else if (HIDDEN_MARKS.has(name) || name === 'QuoteMark') {
          const after = name === 'QuoteMark' ? state.doc.sliceString(node.to, node.to + 1) : ''
          out.push({ from: node.from, to: after === ' ' ? node.to + 1 : node.to, deco: hide })
        } else if (name === 'ListMark') {
          const text = state.doc.sliceString(node.from, node.to)
          // 할 일 줄의 `- ` 는 체크박스가 대신한다
          const next = node.node.nextSibling
          if (next?.name === 'Task') {
            out.push({ from: node.from, to: node.to + 1, deco: hide })
          } else if (text === '-' || text === '*' || text === '+') {
            out.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({ widget: new BulletWidget() })
            })
          }
        } else if (name === 'TaskMarker') {
          const checked = /x/i.test(state.doc.sliceString(node.from, node.to))
          out.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({ widget: new CheckboxWidget(checked, node.from) })
          })
        } else if (name === 'HorizontalRule') {
          out.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({ widget: new RuleWidget() })
          })
        } else if (name === 'Image') {
          const src = node.node.getChild('URL')
          const url = src ? state.doc.sliceString(src.from, src.to) : ''
          const altMatch = /^!\[([^\]]*)\]/.exec(state.doc.sliceString(node.from, node.to))
          if (url !== '') {
            out.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({ widget: new EmbedWidget(url, altMatch?.[1] ?? '') })
            })
          }
          return false
        } else if (name === 'Link') {
          const marks = node.node.getChildren('LinkMark')
          const url = node.node.getChild('URL')
          if (marks.length >= 2 && url) {
            const href = state.doc.sliceString(url.from, url.to)
            out.push({ from: marks[0].from, to: marks[0].to, deco: hide })
            out.push({
              from: marks[0].to,
              to: marks[1].from,
              deco: mark('cm-lp-link', { 'data-lp-href': href, title: href })
            })
            out.push({ from: marks[1].from, to: node.to, deco: hide })
          }
          return false
        }
        return true
      }
    })
  }

  // 위키 링크는 파서가 모른다 — 보이는 줄에서 직접 찾되 코드 안은 건너뛴다
  const inCode = (pos: number): boolean => codeRanges.some(([a, b]) => pos >= a && pos < b)
  for (const { from, to } of view.visibleRanges) {
    const start = Math.max(from, fmEnd)
    if (start >= to) continue
    const text = state.doc.sliceString(start, to)
    const re = new RegExp(WIKILINK_RE.source, 'g')
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const at = start + m.index
      const embed = at > 0 && state.doc.sliceString(at - 1, at) === '!'
      const from0 = embed ? at - 1 : at
      const end = at + m[0].length
      if (inCode(at)) continue
      const target = m[1].trim()
      const alias = m[3]
      const shown = isActive(from0, end)
      if (embed) {
        if (!shown) {
          out.push({
            from: from0,
            to: end,
            deco: Decoration.replace({ widget: new EmbedWidget(target, '') })
          })
        }
        continue
      }
      const resolved = resolveRef ? resolveRef(target).rel : null
      const cls = resolved ? 'cm-lp-wikilink' : 'cm-lp-wikilink cm-lp-missing'
      const attrs: Record<string, string> = { 'data-lp-target': target, title: target }
      if (shown) {
        out.push({ from: at, to: end, deco: mark(cls, attrs) })
        continue
      }
      // `[[대상|` 과 `]]` 를 숨기고 보이는 글자만 링크로
      const labelFrom = alias !== undefined ? end - 2 - alias.length : at + 2
      const labelTo = alias !== undefined ? end - 2 : at + 2 + m[1].length
      out.push({ from: at, to: labelFrom, deco: hide })
      out.push({ from: labelFrom, to: labelTo, deco: mark(cls, attrs) })
      out.push({ from: labelTo, to: end, deco: hide })
    }
  }

  // RangeSetBuilder 는 시작 위치 순서를 요구한다 — 줄 장식(길이 0)이 같은 자리의 표시보다 먼저
  out.sort((a, b) => a.from - b.from || a.deco.startSide - b.deco.startSide || a.to - b.to)
  const builder = new RangeSetBuilder<Decoration>()
  let lastHiddenTo = -1
  for (const { from, to, deco } of out) {
    // 겹친 숨김은 앞의 것만 — 바꾸기 장식끼리 겹치면 CodeMirror 가 던진다
    const replaces = (deco.spec as { widget?: unknown }).widget !== undefined || deco === hide
    if (replaces) {
      if (from < lastHiddenTo) continue
      lastHiddenTo = to
    }
    builder.add(from, to, deco)
  }
  return builder.finish()
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        hasLanguageChange(update.transactions) ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = build(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

// ⌘/Ctrl+클릭 — 링크를 따라간다. 그냥 클릭은 커서를 둔다(고치러 들어가는 길)
const clicks = EditorView.domEventHandlers({
  mousedown: (event, view) => {
    if (!(event.metaKey || event.ctrlKey)) return false
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-lp-target],[data-lp-href]')
    const config = view.state.facet(livePreviewConfig)
    if (!el || !config) return false
    const href = el.getAttribute('data-lp-href')
    if (href !== null) {
      event.preventDefault()
      config.onOpenExternal(href)
      return true
    }
    const target = el.getAttribute('data-lp-target') ?? ''
    const rel = resolveLink(target, config.index).rel
    if (rel === null) return false
    event.preventDefault()
    config.onNavigate(rel)
    return true
  }
})

export const livePreview = (config: LivePreviewConfig): Extension => [
  livePreviewConfig.of(config),
  propertiesFold,
  guardFoldedDelete,
  plugin,
  languageRefresh,
  clicks
]
