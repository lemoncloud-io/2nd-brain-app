/**
 * Obsidian Bases 식의 부분집합 — 필터 한 줄(`status != "done"`·`!file.inFolder("templates")`)과
 * 수식 한 줄(`link(file.path, file.folder.replace(/^.*\//, ""))`)을 계산한다.
 * 문법 출처: obsidian.md/help/bases/syntax·/functions (2026-09-20 확인).
 *
 * 아는 것만 계산하고 모르는 것은 `Unsupported` 로 던진다 — 조건을 빼고 계산하면 틀린 행이
 * 맞는 행처럼 보인다. 뷰 하나가 통째로 "계산 못 함" 이 되는 편이 사람을 덜 속인다.
 * 아는 것: 문자열·숫자·정규식·true/false/null 리터럴, 속성(`이름`·`note.이름`·`note["이름"]`·`file.*`),
 * 수식(`formula.이름`), `== != < > <= >=`, `! && ||`, 괄호,
 * `file.inFolder()`·`file.hasTag()`·`file.hasProperty()`, `link()`,
 * 값에 붙는 `isEmpty()`·`contains()`·`startsWith()`·`endsWith()`·`replace()`·`toLowerCase()`·
 * `toUpperCase()`·`trim()`.
 */
import { currentT } from '../i18n'

/** 식이 보는 노트 한 장 — 파일 정보와 frontmatter */
export interface BaseNote {
  /** 보관함 상대경로 */
  rel: string
  /** 확장자를 뺀 이름 */
  basename: string
  /** 담긴 폴더(맨 위면 빈 문자열) */
  folder: string
  /** frontmatter. 없거나 깨졌으면 빈 객체 */
  props: Record<string, unknown>
  /** 마지막으로 고친 때. 모르면 없음 — `file.mtime` 이 이것을 본다 */
  mtimeMs?: number
  /** 파일 크기(바이트). 모르면 없음 — `file.size` 가 이것을 본다 */
  size?: number
}

/** `link()` 과 `file.name` 이 내놓는 값 — 글자와 갈 곳을 같이 들고 다닌다 */
export interface BaseLink {
  rel: string
  text: string
}

export const isLink = (value: unknown): value is BaseLink =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as BaseLink).rel === 'string' &&
  typeof (value as BaseLink).text === 'string'

export class Unsupported extends Error {}

/** 수식을 풀 때 쓰는 바깥 정보 — `formulas` 는 이름 → 식 한 줄 */
export interface ExprContext {
  formulas?: Record<string, string>
  /** 지금 풀고 있는 수식 이름들 — 서로 부르는 수식이 무한히 도는 것을 막는다 */
  resolving?: readonly string[]
}

type Token =
  | { kind: 'name'; text: string }
  | { kind: 'string'; text: string }
  | { kind: 'number'; value: number }
  | { kind: 'regex'; source: string; flags: string }
  | { kind: 'op'; text: string }

const OPS = ['==', '!=', '<=', '>=', '&&', '||', '<', '>', '!', '(', ')', ',', '.', '[', ']']

/** `/…/flags` 를 읽는다 — 이 문법에 나눗셈이 없어 `/` 는 늘 정규식의 시작이다 */
const readRegex = (input: string, from: number): { token: Token; next: number } => {
  let i = from + 1
  let escaped = false
  let inClass = false
  while (i < input.length) {
    const c = input[i]!
    if (escaped) escaped = false
    else if (c === '\\') escaped = true
    else if (c === '[') inClass = true
    else if (c === ']') inClass = false
    else if (c === '/' && !inClass) break
    i += 1
  }
  if (i >= input.length) throw new Unsupported(currentT().bases.regexUnclosed(input))
  const source = input.slice(from + 1, i)
  const flags = /^[gimsuy]*/.exec(input.slice(i + 1))![0]
  return { token: { kind: 'regex', source, flags }, next: i + 1 + flags.length }
}

const tokenize = (input: string): Token[] => {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const c = input[i]!
    if (/\s/.test(c)) {
      i += 1
      continue
    }
    if (c === '"' || c === "'") {
      const end = input.indexOf(c, i + 1)
      if (end === -1) throw new Unsupported(currentT().bases.quoteUnclosed(input))
      tokens.push({ kind: 'string', text: input.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (c === '/') {
      const { token, next } = readRegex(input, i)
      tokens.push(token)
      i = next
      continue
    }
    if (/[0-9]/.test(c)) {
      const rest = input.slice(i)
      const match = /^[0-9]+(\.[0-9]+)?/.exec(rest)!
      tokens.push({ kind: 'number', value: Number(match[0]) })
      i += match[0].length
      continue
    }
    if (/[A-Za-z_가-힣]/.test(c)) {
      const rest = input.slice(i)
      const match = /^[A-Za-z0-9_\-가-힣]+/.exec(rest)!
      tokens.push({ kind: 'name', text: match[0] })
      i += match[0].length
      continue
    }
    const op = OPS.find((candidate) => input.startsWith(candidate, i))
    if (!op) throw new Unsupported(currentT().bases.unknownChar(c))
    tokens.push({ kind: 'op', text: op })
    i += op.length
    continue
  }
  return tokens
}

/** frontmatter 값 하나 — 배열·숫자·문자열·불리언·날짜·링크·없음 */
type Value = unknown

const asArray = (value: Value): unknown[] =>
  Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]

/** `#태그`·`tags` 는 앞의 `#` 을 무시하고 견준다 */
const sameTag = (a: unknown, b: string): boolean =>
  String(a).replace(/^#/, '') === b.replace(/^#/, '')

const fileProp = (note: BaseNote, prop: string): Value => {
  switch (prop) {
    case 'name':
      return { rel: note.rel, text: note.rel.slice(note.rel.lastIndexOf('/') + 1) }
    case 'basename':
      return note.basename
    case 'path':
      return note.rel
    case 'folder':
      return note.folder
    case 'ext':
      return note.rel.slice(note.rel.lastIndexOf('.') + 1)
    case 'tags':
      return asArray(note.props['tags'])
    case 'mtime':
      return note.mtimeMs === undefined ? null : new Date(note.mtimeMs)
    case 'size':
      return note.size ?? null
    default:
      throw new Unsupported(currentT().bases.unknownFileProp(prop))
  }
}

const callFile = (note: BaseNote, fn: string, args: Value[]): Value => {
  switch (fn) {
    case 'inFolder': {
      const folder = String(args[0] ?? '').replace(/\/$/, '')
      return note.folder === folder || note.folder.startsWith(`${folder}/`)
    }
    case 'hasTag':
      return args.some((arg) =>
        asArray(note.props['tags']).some((tag) => sameTag(tag, String(arg)))
      )
    case 'hasProperty':
      return Object.prototype.hasOwnProperty.call(note.props, String(args[0] ?? ''))
    default:
      throw new Unsupported(currentT().bases.unknownFunction(`file.${fn}()`))
  }
}

/** 값을 글자로 — 메서드가 글자를 받아야 할 때 쓴다 */
const asText = (value: Value): string => {
  if (value === null || value === undefined) return ''
  if (isLink(value)) return value.text
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(asText).join(', ')
  return String(value)
}

/** `isEmpty()` — Obsidian 과 같이 없음·빈 글자·빈 목록만 비었다고 본다(숫자 0 은 값이다) */
const isEmptyValue = (value: Value): boolean => {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value === ''
  if (Array.isArray(value)) return value.length === 0
  if (isLink(value)) return value.text === ''
  return false
}

/** 값에 점으로 붙는 메서드 — `repo.isEmpty()`·`file.folder.replace(…)` */
const callMethod = (value: Value, fn: string, args: Value[]): Value => {
  // 인자 없는 포함 검사는 빈 글자열이라 항상 참이다 — 조용한 과일치 대신 모른다고 말한다
  if ((fn === 'contains' || fn === 'startsWith' || fn === 'endsWith') && args.length < 1) {
    throw new Unsupported(currentT().bases.needsArgument(fn))
  }
  switch (fn) {
    case 'isEmpty':
      return isEmptyValue(value)
    case 'contains':
      return Array.isArray(value)
        ? value.some((one) => asText(one) === asText(args[0]))
        : asText(value).includes(asText(args[0]))
    case 'startsWith':
      return asText(value).startsWith(asText(args[0]))
    case 'endsWith':
      return asText(value).endsWith(asText(args[0]))
    case 'replace': {
      const pattern = args[0]
      const to = asText(args[1])
      return pattern instanceof RegExp
        ? asText(value).replace(pattern, to)
        : asText(value).replace(asText(pattern), to)
    }
    case 'toLowerCase':
      return asText(value).toLowerCase()
    case 'toUpperCase':
      return asText(value).toUpperCase()
    case 'trim':
      return asText(value).trim()
    default:
      throw new Unsupported(currentT().bases.unknownFunction(`.${fn}()`))
  }
}

/** 크기 비교에 쓸 수 — 날짜는 밀리초로 본다 */
const ordinal = (value: Value): number | string | null => {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' || typeof value === 'string') return value
  if (isLink(value)) return value.text
  return null
}

/** 견주기 — 없는 값은 null 로 본다. 크기 비교는 같은 종류끼리만 */
const compare = (op: string, left: Value, right: Value): boolean => {
  const l = left === undefined ? null : left
  const r = right === undefined ? null : right
  if (op === '==' || op === '!=') {
    const lo = ordinal(l)
    const ro = ordinal(r)
    const same =
      lo !== null && ro !== null
        ? lo === ro
        : Array.isArray(l) || Array.isArray(r)
          ? JSON.stringify(l) === JSON.stringify(r)
          : l === r
    return op === '==' ? same : !same
  }
  const lo = ordinal(l)
  const ro = ordinal(r)
  const ordered =
    (typeof lo === 'number' && typeof ro === 'number') ||
    (typeof lo === 'string' && typeof ro === 'string')
  if (!ordered) return false
  if (op === '<') return lo < ro
  if (op === '>') return lo > ro
  if (op === '<=') return lo <= ro
  return lo >= ro
}

/** 참·거짓 판정 — 빈 문자열·0·빈 배열·없음은 거짓 */
export const truthy = (value: Value): boolean => {
  if (Array.isArray(value)) return value.length > 0
  if (value === null || value === undefined) return false
  if (value instanceof Date) return true
  if (isLink(value)) return value.text !== ''
  if (typeof value === 'string') return value !== ''
  if (typeof value === 'number') return value !== 0
  return Boolean(value)
}

class Parser {
  private at = 0

  constructor(
    private readonly tokens: Token[],
    private readonly note: BaseNote,
    private readonly context: ExprContext
  ) {}

  static run(input: string, note: BaseNote, context: ExprContext): Value {
    const parser = new Parser(tokenize(input), note, context)
    const value = parser.or()
    if (parser.at < parser.tokens.length) throw new Unsupported(currentT().bases.unreadToEnd(input))
    return value
  }

  private peek(): Token | undefined {
    return this.tokens[this.at]
  }

  private eat(text: string): boolean {
    const token = this.peek()
    if (token?.kind === 'op' && token.text === text) {
      this.at += 1
      return true
    }
    return false
  }

  private expect(text: string): void {
    if (!this.eat(text)) throw new Unsupported(currentT().bases.expected(text))
  }

  private or(): Value {
    let left = this.and()
    while (this.eat('||')) {
      const right = this.and()
      left = truthy(left) || truthy(right)
    }
    return left
  }

  private and(): Value {
    let left = this.compareLevel()
    while (this.eat('&&')) {
      const right = this.compareLevel()
      left = truthy(left) && truthy(right)
    }
    return left
  }

  private compareLevel(): Value {
    const left = this.unary()
    for (const op of ['==', '!=', '<=', '>=', '<', '>']) {
      if (this.eat(op)) return compare(op, left, this.unary())
    }
    return left
  }

  private unary(): Value {
    if (this.eat('!')) return !truthy(this.unary())
    return this.postfix(this.primary())
  }

  /** 값 뒤에 붙는 `.메서드(…)` 를 왼쪽부터 붙여 나간다 */
  private postfix(start: Value): Value {
    let value = start
    while (this.eat('.')) {
      const fn = this.propName()
      if (!this.eat('(')) throw new Unsupported(currentT().bases.unknownProperty(fn))
      value = callMethod(value, fn, this.args())
    }
    return value
  }

  private primary(): Value {
    if (this.eat('(')) {
      const value = this.or()
      this.expect(')')
      return value
    }
    const token = this.peek()
    if (!token) throw new Unsupported(currentT().bases.cutShort)
    this.at += 1
    if (token.kind === 'string') return token.text
    if (token.kind === 'number') return token.value
    if (token.kind === 'regex') return new RegExp(token.source, token.flags)
    if (token.kind === 'op') throw new Unsupported(currentT().bases.unexpectedChar(token.text))
    return this.fromName(token.text)
  }

  /** 이름으로 시작하는 것 — 리터럴·`file.*`·`note.*`·`formula.*`·`link()`·frontmatter 속성 */
  private fromName(name: string): Value {
    if (name === 'true') return true
    if (name === 'false') return false
    if (name === 'null') return null
    if (name === 'file') {
      this.expect('.')
      const prop = this.propName()
      if (this.eat('(')) return callFile(this.note, prop, this.args())
      return fileProp(this.note, prop)
    }
    if (name === 'note') {
      if (this.eat('[')) {
        const key = this.peek()
        if (key?.kind !== 'string') throw new Unsupported(currentT().bases.noteIndexQuoted)
        this.at += 1
        this.expect(']')
        return this.note.props[key.text] ?? null
      }
      this.expect('.')
      return this.note.props[this.propName()] ?? null
    }
    if (name === 'formula') {
      this.expect('.')
      return this.formula(this.propName())
    }
    if (name === 'link') {
      this.expect('(')
      const args = this.args()
      const rel = asText(args[0])
      return { rel, text: args.length > 1 ? asText(args[1]) : rel }
    }
    if (this.eat('(')) throw new Unsupported(currentT().bases.unknownFunction(`${name}()`))
    return this.note.props[name] ?? null
  }

  /** `formula.<이름>` — 그 수식을 같은 노트에 대고 푼다. 서로 부르면 멈춘다 */
  private formula(name: string): Value {
    const source = this.context.formulas?.[name]
    if (source === undefined) throw new Unsupported(currentT().bases.missingFormula(name))
    const resolving = this.context.resolving ?? []
    if (resolving.includes(name)) throw new Unsupported(currentT().bases.formulaCycle(name))
    return Parser.run(source, this.note, {
      formulas: this.context.formulas,
      resolving: [...resolving, name]
    })
  }

  private propName(): string {
    const token = this.peek()
    if (token?.kind !== 'name') throw new Unsupported(currentT().bases.needsPropertyName)
    this.at += 1
    return token.text
  }

  private args(): Value[] {
    const args: Value[] = []
    if (this.eat(')')) return args
    do {
      args.push(this.or())
    } while (this.eat(','))
    this.expect(')')
    return args
  }
}

/** 식 한 줄을 이 노트에 대고 계산한다. 모르는 문법이면 `Unsupported` 를 던진다 */
export const evaluateExpr = (input: string, note: BaseNote, context: ExprContext = {}): Value =>
  Parser.run(input, note, context)
