import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChatMarkdown } from './chat-markdown'

const render = (text: string, props: { thinking?: string; streaming?: boolean } = {}): string =>
  renderToStaticMarkup(<ChatMarkdown text={text} onOpenExternal={() => undefined} {...props} />)

describe('ChatMarkdown', () => {
  it('GFM 표와 강조를 HTML 로 그린다', () => {
    const html = render('**굵게**\n\n| a | b |\n|---|---|\n| 1 | 2 |')
    expect(html).toContain('<strong>굵게</strong>')
    expect(html).toContain('<table>')
  })

  it('인라인·블록 수식을 KaTeX 로 그린다', () => {
    const html = render('넓이는 $\\pi r^2$ 이다\n\n$$\n\\int_0^1 x\\,dx\n$$')
    expect(html).toContain('class="katex"')
    expect(html).toContain('katex-display')
  })

  it('mermaid 코드 블록은 그리기 전까지 원문 코드를 보인다 — 다른 언어 코드 블록은 그대로다', () => {
    const html = render('```mermaid\ngraph TD; A-->B\n```\n\n```ts\nconst x = 1\n```')
    expect(html).toContain('data-testid="chat-mermaid-pending"')
    expect(html).toContain('graph TD; A--&gt;B')
    expect(html).toContain('class="language-ts"')
  })

  it('생각 블록은 답 위에 접힌 details 로, 없으면 그리지 않는다', () => {
    const html = render('답', { thinking: '먼저 떠올린다' })
    expect(html).toMatch(/<details[^>]*data-testid="chat-thinking"/)
    expect(html).not.toMatch(/<details[^>]*open/)
    expect(html).toContain('먼저 떠올린다')
    expect(render('답')).not.toContain('chat-thinking')
  })

  it('블록 코드는 언어 머리줄과 복사 단추를 갖고, 인라인 코드는 그대로다', () => {
    const html = render('`x` 를 쓴다\n\n```sh\npnpm dev\n```')
    expect(html).toContain('data-testid="chat-code-block"')
    expect(html).toContain('data-testid="chat-code-copy"')
    expect(html).toMatch(/<span[^>]*>sh<\/span>/)
    expect(html).toContain('<code>x</code>')
    expect(html.match(/chat-code-block/g)).toHaveLength(1)
  })

  it('생각 블록은 답을 쓰는 동안 펴 두고 "생각하는 중" 으로 보인다', () => {
    const html = render('', { thinking: '떠올린다', streaming: true })
    expect(html).toMatch(/<details[^>]*open/)
    expect(html).toContain('생각하는 중')
    // 답 글자가 오기 시작하면 생각은 끝났다
    expect(render('답', { thinking: '떠올린다', streaming: true })).not.toContain('생각하는 중')
  })

  it('답에 섞인 HTML 은 실행되지 않고 글자로 남으며 javascript: 링크는 벗겨진다', () => {
    // 문단을 나눠야 마지막 줄이 HTML 블록 글자가 아니라 링크로 해석된다
    const html = render(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\n[눌러](javascript:alert(3))'
    )
    expect(html).not.toContain('<script>')
    expect(html).not.toMatch(/<img[^>]*onerror/)
    expect(html).not.toMatch(/href="javascript:/)
    expect(html).toContain('눌러')
  })

  it('위키 상대 경로 같은 내부 링크는 누를 수 없는 글자로 보인다', () => {
    const html = render('[페이지](wiki/foo.md)')
    expect(html).not.toContain('href="wiki/foo.md"')
    expect(html).toContain('페이지')
  })
})
