// Mermaid 다이어그램 — 채팅 답과 리더가 같이 쓴다. 코드 블록이 있을 때만 mermaid 를 불러온다.
// 잘못된 다이어그램은 화면을 깨뜨리지 않고 원문 코드 블록으로 보인다.
import { Component, useEffect, useId, useState, type ReactNode } from 'react'
import { toUserError } from './user-error'
import { useStage } from './use-stage'
import { getT, useT } from './i18n'

type MermaidState =
  { status: 'pending' } | { status: 'ok'; svg: string } | { status: 'error'; message: string }

/** 그리지 못한 다이어그램 자리 — 원문 코드 + 한 줄 사유. 실패 상태와 경계가 같이 쓴다 */
const MermaidFallback = ({ code, prefix }: { code: string; prefix: string }): React.JSX.Element => {
  const t = useT()
  return (
    <figure data-testid={`${prefix}-mermaid-fallback`} className="my-2">
      <pre className="text-caption overflow-x-auto rounded border border-hairline p-2">
        <code>{code}</code>
      </pre>
      <figcaption className="text-caption text-muted-foreground">
        {t.doc.diagramFallback}
      </figcaption>
    </figure>
  )
}

/**
 * 렌더 도중 던져도 화면 전체가 사라지지 않게 막는다 — MermaidDiagram 은 비동기 실패를
 * 상태로 받지만, 렌더 자체가 던지면 부모가 try/catch 로 잡을 수 없다
 */
export class MermaidErrorBoundary extends Component<
  { code: string; prefix: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error): void {
    console.error('[mermaid] diagram render failed', error)
  }

  render(): ReactNode {
    const { code, prefix, children } = this.props
    return this.state.failed ? <MermaidFallback code={code} prefix={prefix} /> : children
  }
}

export const MermaidDiagram = ({
  code,
  prefix,
  streaming = false
}: {
  code: string
  /** testid 앞자리 — 채팅은 chat, 리더는 wiki */
  prefix: string
  /** 참이면 그리지 않고 기다린다 — 스트리밍 중 코드는 줄마다 바뀐다 */
  streaming?: boolean
}): React.JSX.Element => {
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [state, setState] = useState<MermaidState>({ status: 'pending' })
  // 테마를 바꾸면 다시 그린다 — 밝은 면 색으로 그린 그림은 어두운 바탕에서 흰 상자로 뜬다
  const stage = useStage()

  useEffect(() => {
    if (streaming) return
    let alive = true
    import('mermaid')
      .then(async ({ default: mermaid }) => {
        // strict: 결과 SVG 를 DOMPurify 로 거른다. suppressErrorRendering: 실패 시 오류 다이어그램을 문서에 남기지 않는다
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          suppressErrorRendering: true,
          // initialize 는 매번 기본 설정에서 다시 시작한다 — 밝은 쪽은 비워 두면 기본 모양(flowchart 는
          // redux-color)으로 돌아오고, 어두운 쪽만 그 짝으로 바꾼다
          ...(stage === 'dark' && { theme: 'redux-dark-color', darkMode: true })
        })
        // parse 는 렌더 없이 문법만 본다(잘못되면 throw)
        await mermaid.parse(code)
        const { svg } = await mermaid.render(id, code)
        if (alive) setState({ status: 'ok', svg })
      })
      .catch((err: unknown) => {
        if (alive) {
          setState({ status: 'error', message: toUserError(err, getT().doc.diagramFailed).text })
        }
      })
    return () => {
      alive = false
    }
  }, [id, code, streaming, stage])

  if (state.status === 'ok' && !streaming) {
    // mermaid strict 가 DOMPurify 로 거른 SVG 다
    return (
      <div
        data-testid={`${prefix}-mermaid`}
        className="my-2 overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
    )
  }
  const failed = state.status === 'error' && !streaming
  if (failed) return <MermaidFallback code={code} prefix={prefix} />
  return (
    <figure data-testid={`${prefix}-mermaid-pending`} className="my-2">
      <pre className="text-caption overflow-x-auto rounded border border-hairline p-2">
        <code>{code}</code>
      </pre>
    </figure>
  )
}
