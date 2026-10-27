// @vitest-environment jsdom
// 큰 속성 블록 — 닫힘이 스캔 상한(20000자)을 넘겨도 접어야 한다(회귀).
// live-preview.dom.test.ts 는 @codemirror/commands 를 못 읽어 이 환경에서 통째로 못 돌ので,
// 이 파일은 그 모듈 없이 접기만 본다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { livePreview } from './live-preview'

let view: EditorView | null = null
afterEach(() => {
  view?.destroy()
  view = null
  document.body.innerHTML = ''
})

const open = (doc: string): EditorView => {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [
        markdown({ base: markdownLanguage }),
        livePreview({
          index: [],
          onNavigate: vi.fn(),
          onOpenExternal: vi.fn()
        })
      ]
    })
  })
  view.dispatch({})
  return view
}

describe('big frontmatter fold', () => {
  it('닫힘이 20000자를 넘겨도 속성 블록을 접는다', () => {
    const doc = `---\ntitle: big\ntags: [${'x'.repeat(20100)}]\n---\n\n본문`
    expect(doc.indexOf('\n---\n')).toBeGreaterThan(20000)
    const v = open(doc)
    expect(v.contentDOM.querySelector('[data-testid="lp-properties"]')).not.toBeNull()
  })

  it('상한 안의 속성 블록은 그대로 접는다', () => {
    const v = open('---\ntitle: a\n---\n\n본문')
    expect(v.contentDOM.querySelector('[data-testid="lp-properties"]')).not.toBeNull()
  })
})
