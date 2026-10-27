import {
  createElement,
  useCallback,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode
} from 'react'
import type { OpenLink } from './open-external'
import { ChevronRight } from 'lucide-react'
import ReactMarkdown, { type Options as MarkdownOptions } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { rehypeFind, type FindOptions } from './rehype-find'
import { WIKILINK_RE, createLinkResolver, type PageRef } from '../../../shared/wiki/parse'
import { foldsIn, isChanged, type Fold, type Marks } from './doc-marks'
import { closedRanges, outlineOf } from './plan-outline'
import { CHECKBOX, eachProseLine } from '../../../shared/wiki/checkbox'
import { fileKind, vaultUrl } from '../../../shared/vault-file-types'
import { MediaPreview } from '../components/media-preview'
import { useLinkPreview, type LinkHover } from './use-link-preview'
import { MermaidDiagram, MermaidErrorBoundary } from './mermaid-diagram'
import { useT } from './i18n'

/**
 * 코드 렌더러 — mermaid 블록만 그림으로 그린다(채팅 답과 같은 그림).
 * `components` 의 참조가 바뀌면 react-markdown 이 그 자리를 다시 마운트해
 * 펼쳐 둔 지운 글이 접히므로 모듈 상수로 둔다.
 */
const codeComponents = {
  code: ({ className, children }: { className?: string; children?: ReactNode }) => {
    if (className === 'language-mermaid') {
      const diagram = String(children ?? '').replace(/\n$/, '')
      return (
        <MermaidErrorBoundary code={diagram} prefix="wiki">
          <MermaidDiagram code={diagram} prefix="wiki" />
        </MermaidErrorBoundary>
      )
    }
    return <code className={className}>{children}</code>
  }
}

/**
 * 리더용 렌더러 — GFM·wikilink 이동.
 * - `[[target(#h)?(\|alias)?]]`를 내부 링크로 바꾼다(코드 펜스·인라인 코드 밖).
 * - `![[x]]`·`![](x)` 이미지는 vault:// URL로.
 * - 위키 링크에 마우스를 올리면 그 페이지 미리보기(`lib/use-link-preview`).
 * - 외부 링크는 onOpenExternal 로 — http(s) 는 새 웹 탭, ⌘/Ctrl+클릭·mailto 는 바깥(open-external.ts). 창 내비게이션은 하지 않는다.
 */

const EMBED_RE = /!\[\[([^[\]]+)\]\]/g

const VAULT_PREFIX = 'vault://local/'

/** 사람이 쓴 주소는 깨져 있을 수 있다 — decode가 던지면 원문 그대로 쓴다(리더에 에러 경계가 없다).
 * vaultUrl 이 조각별 encodeURIComponent 라 %23·%3F 도 풀어야 해서 decodeURI 가 아니라 전체 디코딩이다 */
const decodeVaultRel = (encoded: string): string => {
  try {
    return decodeURIComponent(encoded)
  } catch {
    return encoded
  }
}

const makeVaultUrl = (target: string): string => vaultUrl(target.trim())

/** 본문 텍스트를 react-markdown이 이해하는 형태로 재작성한다 */
const transformMarkdown = (text: string): string =>
  text
    // 코드 펜스·인라인 코드 보호
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, (m) => m.replace(/\[/g, '\uFFFD'))
    .replace(/`[^`\n]*`/g, (m) => m.replace(/\[/g, '\uFFFD'))
    // ![[이미지]] → vault://
    .replace(EMBED_RE, (_m, target: string) => `![](${makeVaultUrl(target)})`)
    // [[링크]] → [별칭](wiki-link:target)
    .replace(
      WIKILINK_RE,
      (_m, target: string, _h: string | undefined, alias: string | undefined) =>
        `[${(alias ?? target).trim()}](wiki-link:${encodeURIComponent(target.trim())})`
    )
    .replace(/\uFFFD/g, '[')

/** 그림도 소리도 영상도 아닌 임베드(`![[보고서.pdf]]`) — 파일 이름으로 보이고 누르면 그 파일을 연다 */
const EmbedLink = ({
  rel,
  onOpenFile
}: {
  rel: string
  onOpenFile?: (rel: string) => void
}): React.JSX.Element => {
  const name = rel.split('/').pop() ?? rel
  if (!onOpenFile) return <span data-testid="embed-file">{name}</span>
  return (
    <button
      type="button"
      className="focus-ring rounded underline decoration-dotted underline-offset-2"
      data-testid="embed-file"
      onClick={() => onOpenFile(rel)}
    >
      {name}
    </button>
  )
}

/** 지운 글 — 접어 두고 누르면 펼친다. 되돌리기와 다르다: 보여 주기만 한다 */
const RemovedFold = ({ text }: { text: string }): React.JSX.Element => {
  const t = useT()
  const [open, setOpen] = useState(false)
  const lines = text.split('\n').length
  return (
    <div className="my-1" data-testid="changed-removed">
      <button
        type="button"
        className="focus-ring flex items-center gap-1 rounded text-caption text-muted-foreground hover:text-label"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <ChevronRight aria-hidden className={`size-3 ${open ? 'rotate-90' : ''}`} />
        {t.doc.deletedLines(lines)}
      </button>
      {open && (
        <pre className="mt-1 border-l-2 border-hairline pl-3 text-caption whitespace-pre-wrap text-muted-foreground line-through">
          {text}
        </pre>
      )}
    </div>
  )
}

type LinkProps = { href?: string; children?: ReactNode }

/** 여백 막대를 붙일 덩어리 — 원문 줄 범위를 아는 블록 요소 */
const BLOCKS = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'pre',
  'table',
  'hr'
] as const

/** 안에 든 덩어리 — 목록은 스스로 표시하지 않지만 자기 줄은 안쪽 `li` 의 몫이다 */
const NESTED = new Set<string>([...BLOCKS, 'ul', 'ol'])

/** 지운 글을 안에 담을 수 있는 덩어리 — `p` 안에는 블록을 넣을 수 없어 옆에 둔다 */
const HOLDS_FOLD = new Set<string>(['li', 'blockquote'])

type BlockChild = {
  type?: string
  tagName?: string
  value?: string
  properties?: { checked?: boolean }
  position?: { start: { line: number } }
  children?: BlockChild[]
}

type BlockNode = {
  tagName?: string
  children?: BlockChild[]
  position?: { start: { line: number }; end: { line: number } }
}

type BlockProps = ComponentProps<'div'> & { node?: BlockNode }

/**
 * 이 덩어리가 혼자 갖는 줄 범위 — 안에 든 덩어리(인용문 안의 문단, 목록 안의 목록)의 줄은 뺀다.
 * 안팎이 다 표시하면 막대가 두 겹이고 지운 글이 두 번 보인다. 가진 줄이 없으면 null.
 */
const ownRange = (node: BlockNode): { from: number; to: number } | null => {
  const at = node.position
  if (!at) return null
  const inner = (node.children ?? [])
    .filter((child) => child.type === 'element' && NESTED.has(child.tagName ?? ''))
    .map((child) => child.position?.start.line)
    .filter((line): line is number => line !== undefined)
  const to = inner.length === 0 ? at.end.line : Math.min(at.end.line, Math.min(...inner) - 1)
  return to < at.start.line ? null : { from: at.start.line, to }
}

/** 헤딩에 이름표를 붙인다 — 목차가 이 id 로 그 절을 찾아간다 */
const HEADING_TAGS = new Set<string>(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/** 이 항목이 체크박스 항목인가 — remark-gfm 이 `li` 앞에 넣어 준 `input` 이 답이다 */
const taskOf = (node: BlockNode | undefined): { checked: boolean } | null => {
  const box = (node?.children ?? []).find((child) => child.tagName === 'input')
  return box ? { checked: box.properties?.checked === true } : null
}

/** 체크박스의 이름 — 항목 글자. 안쪽 목록은 제 체크박스의 몫이라 뺀다 */
const taskLabel = (children: BlockChild[] | undefined): string =>
  (children ?? [])
    .map((child) =>
      child.type === 'text'
        ? (child.value ?? '')
        : NESTED.has(child.tagName ?? '')
          ? ''
          : taskLabel(child.children)
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

/** 리더가 덧붙이는 것들 — 바뀐 곳 표시, 헤딩 이름표, 누를 수 있는 체크박스 */
type Deco = {
  marks?: Marks
  ids: Map<number, string>
  /** 없으면 체크박스를 잠근다(근거 시트·미리보기는 읽기만 한다). 줄 번호는 이 글 기준 */
  onToggle?: (line: number) => void
  /** 접을 덩어리 — "열린 항목만" 이 켜졌을 때 끝난 항목과 전부 끝난 절의 글이 여기 든다 */
  folded?: (from: number, to: number, checked: boolean) => boolean
}

const addClass = (className: unknown, extra: string | null): string | undefined => {
  const merged = [typeof className === 'string' ? className : null, extra].filter(Boolean).join(' ')
  return merged === '' ? undefined : merged
}

/**
 * 바뀐 문단에 막대를, 지운 자리에 접은 글을 붙인다 — react-markdown 이 주는 원문 줄 위치로 가린다.
 * 헤딩 이름표와 체크박스도 같은 줄 위치로 붙는다. 줄 위치를 모르는 노드(플러그인이 지어낸 것)는
 * 표시 없이 그냥 그린다.
 */
const blockWith = (
  tag: (typeof BLOCKS)[number],
  deco: Deco
): ((props: BlockProps) => React.JSX.Element) => {
  const Block = ({ node, children, ...rest }: BlockProps): React.JSX.Element => {
    const t = useT()
    const line = node?.position?.start.line
    const task = tag === 'li' ? taskOf(node) : null
    // "열린 항목만" 에서 접힌 자리 — 글은 그대로 두고 그리지만 않는다(줄 번호가 어긋나지 않는다)
    const last = node?.position?.end.line
    if (line !== undefined && deco.folded?.(line, last ?? line, task?.checked === true) === true) {
      return <></>
    }
    const base = {
      ...rest,
      className: addClass(rest.className, task ? 'task-item' : null),
      ...(HEADING_TAGS.has(tag) && line !== undefined && deco.ids.has(line)
        ? { id: deco.ids.get(line) }
        : {}),
      // 가로로 넘치는 코드 블록 — 키보드로도 닿아야 화살표로 스크롤할 수 있다
      ...(tag === 'pre' ? { tabIndex: 0 } : {})
    }
    // 목록 표식 자리에 체크박스가 들어간다 — remark-gfm 이 넣은 `input` 은 그리지 않는다(`input` 컴포넌트)
    const content =
      task === null || line === undefined ? (
        children
      ) : (
        <>
          <input
            type="checkbox"
            data-testid="wiki-checkbox"
            className="wiki-task-box"
            aria-label={taskLabel(node?.children) || t.doc.task}
            checked={task.checked}
            disabled={deco.onToggle === undefined}
            onChange={() => deco.onToggle?.(line)}
          />
          {children}
        </>
      )

    const marks = deco.marks
    const own = node === undefined || marks === undefined ? null : ownRange(node)
    if (own === null || marks === undefined) return createElement(tag, base, content)
    const { from, to } = own
    const before = foldsIn(marks, from, to, 'before')
    const after = foldsIn(marks, from, to, 'after')
    const marked = isChanged(marks, from, to)
    const props = {
      ...base,
      className: addClass(base.className, marked ? 'changed-block' : null),
      ...(marked ? { 'data-testid': 'changed-mark' } : {})
    }
    if (before.length === 0 && after.length === 0) return createElement(tag, props, content)
    const gone = (folds: Fold[], side: string): React.JSX.Element[] =>
      folds.map((fold, i) => <RemovedFold key={`${side}${i}`} text={fold.text} />)
    // `p` 안에는 블록을 넣을 수 없다 — 담을 수 있는 덩어리만 안에, 나머지는 옆에 둔다
    return HOLDS_FOLD.has(tag) ? (
      createElement(
        tag,
        props,
        <>
          {gone(before, 'b')}
          {content}
          {gone(after, 'a')}
        </>
      )
    ) : (
      <>
        {gone(before, 'b')}
        {createElement(tag, props, content)}
        {gone(after, 'a')}
      </>
    )
  }
  return Block
}

const blockComponents = (deco: Deco): Record<string, unknown> => ({
  ...Object.fromEntries(BLOCKS.map((tag) => [tag, blockWith(tag, deco)])),
  // 체크박스는 `li` 가 제 줄 번호를 알고 그린다 — 여기에 그대로 두면 항목마다 상자가 둘이다
  input: () => null
})

/** 같은 표시·이름표면 같은 컴포넌트여야 한다 — 매 렌더 새로 지으면 본문이 다시 마운트돼 펼친 글이 접힌다 */
const useBlockComponents = (
  text: string,
  marks: Marks | undefined,
  onToggle: ((line: number) => void) | undefined,
  openOnly: boolean
): Record<string, unknown> => {
  // 목차와 같은 파서가 이름표와 접을 자리를 짓는다 — 두 벌로 지으면 눌러도 그 절로 가지 않는다
  const outline = useMemo(() => outlineOf(text), [text])
  const ids = useMemo(
    () => new Map(outline.sections.map((section) => [section.line, section.id])),
    [outline]
  )
  const folded = useMemo(() => {
    if (!openOnly) return undefined
    const closed = closedRanges(outline, text.split('\n').length)
    const open: number[] = []
    eachProseLine(text, (lineText, at) => {
      if (CHECKBOX.exec(lineText)?.[1] === ' ') open.push(at)
    })
    return (from: number, to: number, checked: boolean): boolean => {
      // 끝난 항목이라도 그 안에 남은 항목이 있으면 남긴다 — 접으면 열린 자식까지 같이 사라진다
      if (checked) return !open.some((at) => at > from && at <= to)
      return closed.some((range) => from >= range.from && from <= range.to)
    }
  }, [openOnly, outline, text])
  return useMemo(
    () => blockComponents({ marks, ids, folded, onToggle }),
    [marks, ids, folded, onToggle]
  )
}

/**
 * 링크·이미지 렌더러 — `index` 와 두 핸들러에만 매인다. 블록 컴포넌트와 같은 이유로 메모한다:
 * `components` 의 참조가 바뀌면 react-markdown 이 그 자리를 다시 마운트해 이미지가 다시 디코드되고
 * 링크가 hover·초점을 잃는다.
 */
const useLinkComponents = (
  index: PageRef[],
  onNavigate: (rel: string) => void,
  onOpenExternal: OpenLink,
  onOpenFile: ((rel: string) => void) | undefined,
  hover: LinkHover | null
): Record<string, unknown> =>
  useMemo(() => {
    // 링크마다 index 전체를 다시 훑으면 문서 크기에 비례해 느려진다 — 조회표를 한 번 만든다
    const resolveRef = createLinkResolver(index)
    return {
      a: ({ href, children }: LinkProps) => {
        if (href?.startsWith('wiki-link:')) {
          const target = decodeURIComponent(href.slice('wiki-link:'.length))
          const { rel } = resolveRef(target)
          // 못 찾은 링크는 눌러도 아무 일도 안 난다 — 탭이 닿는 죽은 고리로 두지 않고 글로 둔다
          if (!rel)
            return (
              <span
                data-testid="wiki-link-missing"
                data-target={target}
                className="text-destructive decoration-dashed"
              >
                {children}
              </span>
            )
          return (
            <a
              href="#"
              data-testid="wiki-link"
              data-target-rel={rel}
              data-target={target}
              onClick={(e) => {
                e.preventDefault()
                onNavigate(rel)
              }}
              {...(hover && {
                onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
                  if (e.pointerType !== 'touch') hover.enter(rel, e.currentTarget)
                },
                onPointerLeave: hover.leave,
                onFocus: (e: React.FocusEvent<HTMLElement>) => hover.enter(rel, e.currentTarget),
                onBlur: hover.leave
              })}
            >
              {children}
            </a>
          )
        }
        if (href && /^(https?:|mailto:)/i.test(href)) {
          return (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                onOpenExternal(href, { external: e.metaKey || e.ctrlKey })
              }}
            >
              {children}
            </a>
          )
        }
        // 허용 목록 밖 href(javascript:·data:·file: 등)는 눌러도 아무 일도 안 나게 글자로 둔다 —
        // 팀 문서가 렌더러에서 스크립트를 실행하는 XSS를 막는다(chat-markdown 과 같은 규칙)
        return <span>{children}</span>
      },
      img: ({ src, alt }: { src?: string; alt?: string }) => {
        const source =
          typeof src === 'string' &&
          /^(https?:)?\/\//.test(src) === false &&
          !src.startsWith('vault://')
            ? makeVaultUrl(src)
            : src
        // alt 없으면 장식용으로 숨겨져 정보가 사라진다 — 파일명으로 대체한다
        const altText = (): string => {
          if (alt) return alt
          if (!src) return ''
          try {
            return decodeURIComponent(src.split('?')[0]?.split('/').pop() ?? '')
          } catch {
            return ''
          }
        }
        // 보관함 파일은 종류대로 그린다 — 소리·영상을 <img> 로 그리면 깨진 그림이 된다
        if (typeof source === 'string' && source.startsWith(VAULT_PREFIX)) {
          const rel = decodeVaultRel(source.slice(VAULT_PREFIX.length))
          const kind = fileKind(rel)
          if (kind === 'audio' || kind === 'video')
            return <MediaPreview key={rel} rel={rel} kind={kind} compact />
          if (kind !== 'image') return <EmbedLink rel={rel} onOpenFile={onOpenFile} />
        }
        return <img src={source} alt={altText()} className="max-w-full rounded-md" />
      }
    }
  }, [index, onNavigate, onOpenExternal, onOpenFile, hover])

export const WikilinkMarkdown = ({
  text,
  index,
  marks,
  onNavigate,
  onOpenExternal,
  onOpenFile,
  onToggleCheckbox,
  openOnly = false,
  find,
  linkPreview = true
}: {
  text: string
  index: PageRef[]
  /** 기준 시점 이후 바뀐 곳 — 없으면 표시하지 않는다 */
  marks?: Marks
  onNavigate: (rel: string) => void
  onOpenExternal: OpenLink
  /** md 아닌 임베드(`![[보고서.pdf]]`)를 누르면 그 파일을 연다. 없으면 이름만 보인다 */
  onOpenFile?: (rel: string) => void
  /**
   * 체크박스를 눌렀다 — 이 글 기준 줄 번호. 없으면 체크박스를 잠근다.
   * 렌더마다 새 함수를 주면 본문이 다시 마운트돼 펼쳐 둔 지운 글이 접힌다 — 변하지 않는 함수를 준다.
   */
  onToggleCheckbox?: (line: number) => void
  /** 끝난 항목과 전부 끝난 절을 접는다 */
  openOnly?: boolean
  /** 리더 찾기 — 일치를 <mark data-hit> 로 감싼다(번호·지금 자리는 lib/find-dom 이 화면에서). 같은 객체를 주면 다시 그리지 않는다 */
  find?: FindOptions
  /** 위키 링크에 머물면 그 페이지 미리보기를 띄운다 — 미리보기 안 본문은 끈다(칸 위에 칸을 쌓지 않는다) */
  linkPreview?: boolean
}): React.JSX.Element => {
  const blocks = useBlockComponents(text, marks, onToggleCheckbox, openOnly)
  // 미리보기 본문도 리더와 같은 렌더러·같은 이동으로 그린다
  const renderPreview = useCallback(
    (body: string) => (
      <WikilinkMarkdown
        text={body}
        index={index}
        onNavigate={onNavigate}
        onOpenExternal={onOpenExternal}
        onOpenFile={onOpenFile}
        linkPreview={false}
      />
    ),
    [index, onNavigate, onOpenExternal, onOpenFile]
  )
  const { hover, popover } = useLinkPreview(renderPreview)
  const links = useLinkComponents(
    index,
    onNavigate,
    onOpenExternal,
    onOpenFile,
    linkPreview ? hover : null
  )
  const components = useMemo(() => ({ ...blocks, ...links, ...codeComponents }), [blocks, links])
  // unified 는 [attacher, options] 로 받아 attacher(options) 가 돌려준 transformer 를 쓴다
  const rehypePlugins = useMemo<NonNullable<MarkdownOptions['rehypePlugins']>>(
    () => (find === undefined ? [] : [[rehypeFind, find]]),
    [find]
  )
  return (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        // 프롭이 없으면 기본 urlTransform 이 wiki-link: 프로토콜을 벗겨낸다 — 항등 함수로 덮어쓴다
        urlTransform={(url) => url}
        components={components}
      >
        {transformMarkdown(text)}
      </ReactMarkdown>
      {popover}
    </>
  )
}
