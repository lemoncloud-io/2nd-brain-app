// 채팅 답 렌더러(슬라이스 13) — GFM·수식(KaTeX)·Mermaid 다이어그램·생각 블록. Mermaid 는 코드 블록이 있을 때만 불러온다.
// 잘못된 다이어그램은 채팅을 깨뜨리지 않고 원문 코드 블록으로 보인다. 답에 섞인 HTML 은 글자로 남는다(react-markdown 기본).
// 인라인 코드가 보관함에 있는 파일 경로면 눌러서 가운데에 연다(`chat-paths.ts`).
import { isValidElement, memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { OpenLink } from './open-external'
import { ChevronDown } from 'lucide-react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { vaultPathIn, type VaultFileIndex } from './chat-paths'
import {
  MermaidDiagram,
  MermaidErrorBoundary as SharedMermaidErrorBoundary
} from './mermaid-diagram'
import { CopyButton } from '../components/copy-button'
import { cn } from './utils'
import { useT } from './i18n'

/**
 * 채팅 자리의 경계 — prefix 만 chat 으로 고정한다. 본체는 lib/mermaid-diagram 이다
 * (리더가 같은 그림을 wiki- 접두로 쓴다)
 */
export const MermaidErrorBoundary = ({
  code,
  children
}: {
  code: string
  children: ReactNode
}): React.JSX.Element => (
  <SharedMermaidErrorBoundary code={code} prefix="chat">
    {children}
  </SharedMermaidErrorBoundary>
)

const MermaidBlock = ({
  code,
  streaming
}: {
  code: string
  streaming: boolean
}): React.JSX.Element => <MermaidDiagram code={code} prefix="chat" streaming={streaming} />

// 렌더마다 새 배열을 만들지 않게 모듈 상수로 둔다
const REMARK_PLUGINS = [remarkGfm, remarkMath]
const REHYPE_PLUGINS = [rehypeKatex]

type CodeProps = { className?: string; children?: ReactNode }
type LinkProps = { href?: string; children?: ReactNode }
type PreProps = { children?: ReactNode }

/** 코드 블록 — 머리줄에 언어와 복사 단추. 답에서 명령·코드를 손으로 긁어 가지 않게 한다 */
const CodeBlock = ({ language, code }: { language: string; code: string }): React.JSX.Element => {
  const t = useT()
  return (
    <div data-testid="chat-code-block">
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-hairline bg-secondary py-0.5 pr-1 pl-3 text-micro text-muted-foreground">
        <span className="font-mono lowercase">{language}</span>
        <CopyButton
          text={code}
          label={t.chat.copyCode}
          testId="chat-code-copy"
          className="focus-ring tactile inline-flex rounded-md p-1.5 hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
        />
      </div>
      <pre className="m-0 rounded-t-none border border-hairline">
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  )
}

/**
 * 생각 블록 — 답을 쓰는 동안에는 펴서 무엇을 하는지 보이고, 다 쓰면 접는다. 그 사이 사람이
 * 직접 여닫은 것은 존중한다: 다음 전환(쓰기 시작·끝)까지 그대로 둔다
 */
const Thinking = ({
  text,
  streaming,
  answering
}: {
  text: string
  streaming: boolean
  /** 답 글자가 오기 시작했다 — 생각은 끝났다 */
  answering: boolean
}): React.JSX.Element => {
  const t = useT()
  const active = streaming && !answering
  const [open, setOpen] = useState(streaming)
  // 쓰기 시작·끝이 바뀌면 닫힘·열림을 맞춘다 — 커밋된 뒤에 맞춘다.
  // 렌더 중에 맞추면(이전 코드) 묶음 렌더와 어긋나 열린 채 남는다: 버려진 동시성 렌더의
  // setState 가 살아남아 뒤 렌더를 덮는다. 그 사이 사람이 여닫은 것은 전환까지 둔다
  const phase = useRef(streaming)
  useEffect(() => {
    if (phase.current !== streaming) {
      phase.current = streaming
      setOpen(streaming)
    }
  }, [streaming])
  return (
    <details
      data-testid="chat-thinking"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group/thinking mb-2 text-caption text-muted-foreground"
    >
      <summary className="focus-ring inline-flex cursor-pointer list-none items-center gap-1 rounded-sm select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <span className={cn(active && 'shimmer')}>
          {active ? t.chat.thinkingActive : t.chat.thinking}
        </span>
        <ChevronDown
          aria-hidden
          className="size-3.5 transition-transform group-open/thinking:rotate-180"
        />
      </summary>
      <p className="mt-1.5 border-l-2 border-hairline pl-3 whitespace-pre-wrap">{text}</p>
    </details>
  )
}

export const ChatMarkdown = memo(function ChatMarkdown({
  text,
  thinking,
  streaming = false,
  onOpenExternal,
  vaultFiles,
  onOpenFile
}: {
  text: string
  /** 모델의 생각 블록 — 있으면 답 위에 접어 둔다 */
  thinking?: string
  /** 답이 아직 오는 중 — Mermaid 는 끝난 뒤 그린다 */
  streaming?: boolean
  onOpenExternal: OpenLink
  /** 보관함 파일 경로 — 인라인 코드가 이 중 하나를 가리키면 눌러서 연다. 없으면(아직 못 읽음) 코드 글자 그대로 */
  vaultFiles?: VaultFileIndex
  onOpenFile?: (rel: string) => void
}): React.JSX.Element {
  // memo 라도 안쪽 구독이 언어 전환 때 다시 그린다 — 이미 그려진 답의 문구도 바뀐다
  const t = useT()
  // 렌더마다 새 함수를 주면 React 가 다른 컴포넌트로 보고 코드 블록·다이어그램을 다시 만든다 —
  // 복사 표시가 지워지고 Mermaid 가 다시 그려진다. 바뀔 때만 새로 만든다
  const components = useMemo(
    (): Components => ({
      pre: ({ children }: PreProps) => {
        // 블록 코드만 여기로 온다 — 안의 code 요소에서 언어와 원문을 꺼낸다. Mermaid 는 그림이 제 틀을 갖는다
        const props: CodeProps = isValidElement<CodeProps>(children) ? children.props : {}
        const language = /language-(\S+)/.exec(props.className ?? '')?.[1] ?? 'text'
        if (language === 'mermaid') return <>{children}</>
        return (
          <CodeBlock language={language} code={String(props.children ?? '').replace(/\n$/, '')} />
        )
      },
      code: ({ className, children }: CodeProps) => {
        if (className === 'language-mermaid') {
          const diagram = String(children ?? '').replace(/\n$/, '')
          return (
            <MermaidErrorBoundary code={diagram}>
              <MermaidBlock code={diagram} streaming={streaming} />
            </MermaidErrorBoundary>
          )
        }
        // 인라인 코드만 여기까지 온다(블록은 위 pre 가 원문으로 그린다) — 보관함 파일이면 눌러서 연다
        const rel =
          vaultFiles !== undefined && onOpenFile !== undefined && typeof children === 'string'
            ? vaultPathIn(children, vaultFiles)
            : null
        if (rel !== null && onOpenFile !== undefined) {
          return (
            <button
              type="button"
              data-testid="chat-path"
              title={t.chat.openPath(rel)}
              // 링크 글자 안의 경로면 바깥 링크까지 같이 열리지 않게 한다
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                onOpenFile(rel)
              }}
              className="focus-ring inline rounded-sm text-left text-primary-ink underline decoration-dotted underline-offset-2 hover:decoration-solid"
            >
              <code className={className}>{children}</code>
            </button>
          )
        }
        return <code className={className}>{children}</code>
      },
      a: ({ href, children }: LinkProps) =>
        // 외부 링크만 연다(http(s) 는 새 웹 탭, ⌘/Ctrl+클릭·mailto 는 기본 브라우저·메일 앱) — 볼트 상대 경로 등은 채팅 창에서 갈 곳이 없어 글자로 둔다
        href && /^(https?:|mailto:)/.test(href) ? (
          <a
            href={href}
            className="text-primary-ink underline"
            onClick={(e) => {
              e.preventDefault()
              onOpenExternal(href, { external: e.metaKey || e.ctrlKey })
            }}
          >
            {children}
          </a>
        ) : (
          <span>{children}</span>
        )
    }),
    [streaming, onOpenExternal, vaultFiles, onOpenFile, t]
  )
  return (
    <div className="prose-wiki prose-compact min-w-0" data-testid="chat-markdown">
      {thinking && <Thinking text={thinking} streaming={streaming} answering={text !== ''} />}
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
