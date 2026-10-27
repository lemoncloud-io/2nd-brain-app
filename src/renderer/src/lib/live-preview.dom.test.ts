// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { deleteCharBackward, history, undo } from '@codemirror/commands'
import { bodyPosAt, frontmatterEnd, livePreview } from './live-preview'
import { applyLanguage } from './i18n'

let view: EditorView | null = null
afterEach(() => {
  view?.destroy()
  view = null
})

const open = (doc: string, cursor = doc.length, extra: Extension = []): EditorView => {
  const onNavigate = vi.fn()
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        extra,
        markdown({ base: markdownLanguage }),
        livePreview({
          index: [{ rel: 'wiki/topics/ai.md', slug: 'topics/ai' }],
          onNavigate,
          onOpenExternal: vi.fn()
        })
      ]
    })
  })
  ensureSyntaxTree(view.state, view.state.doc.length, 5000)
  // 파서가 끝난 뒤 장식을 다시 그리게 빈 트랜잭션을 한 번 보낸다
  view.dispatch({})
  return view
}

const lineText = (v: EditorView, n: number): string =>
  (v.contentDOM.querySelectorAll('.cm-line')[n - 1] as HTMLElement).textContent ?? ''

describe('frontmatterEnd', () => {
  it('첫머리 속성 블록의 끝을 준다 — 없으면 0', () => {
    expect(frontmatterEnd('---\ntitle: a\n---\n# x')).toBe('---\ntitle: a\n---\n'.length)
    expect(frontmatterEnd('# x\n---\n')).toBe(0)
    expect(frontmatterEnd('---\n닫히지 않음')).toBe(0)
  })
})

describe('livePreview', () => {
  it('커서가 없는 줄은 기호를 숨기고, 커서가 선 줄은 원문을 보인다', () => {
    const v = open('# 제목\n\n**굵게** 와 [[topics/ai|인공지능]]\n\n끝', 0)
    // 1줄(커서) 원문
    expect(lineText(v, 1)).toBe('# 제목')
    // 3줄 — 기호 없이 보이는 글자만
    expect(lineText(v, 3)).toBe('굵게 와 인공지능')
    expect(v.contentDOM.querySelector('.cm-lp-wikilink')?.getAttribute('data-lp-target')).toBe(
      'topics/ai'
    )
    // 커서를 3줄로 옮기면 그 줄이 원문으로 돌아가고 제목 줄은 숨는다
    v.dispatch({ selection: { anchor: v.state.doc.line(3).from } })
    expect(lineText(v, 3)).toBe('**굵게** 와 [[topics/ai|인공지능]]')
    expect(lineText(v, 1)).toBe('제목')
    expect(v.contentDOM.querySelector('.cm-lp-h1')).not.toBeNull()
  })

  it('없는 페이지 링크는 따로 표시한다', () => {
    const v = open('[[없는 페이지]]\n\n끝')
    expect(v.contentDOM.querySelector('.cm-lp-missing')?.textContent).toBe('없는 페이지')
  })

  it('할 일 상자를 누르면 원문의 [ ] 가 [x] 로 바뀐다', () => {
    const v = open('- [ ] 우유 사기\n\n끝')
    const box = v.contentDOM.querySelector<HTMLInputElement>('input.cm-lp-task')
    expect(box).not.toBeNull()
    box!.click()
    expect(v.state.doc.line(1).text).toBe('- [x] 우유 사기')
  })

  it('그림 임베드는 그림으로 그린다', () => {
    const v = open('![[attachments/a b.png]]\n\n끝')
    const img = v.contentDOM.querySelector<HTMLImageElement>('[data-testid="lp-image"]')
    expect(img?.getAttribute('src')).toBe('vault://local/attachments/a%20b.png')
  })

  it('코드 안의 [[ ]] 와 속성 블록은 건드리지 않는다', () => {
    const v = open('---\ntitle: a\n---\n`[[x]]` 코드\n\n끝', 0)
    expect(lineText(v, 1)).toBe('---')
    expect(v.contentDOM.querySelector('.cm-lp-wikilink')).toBeNull()
  })

  it('속성 블록은 커서가 밖에 있으면 한 줄 칩으로 접히고, 누르면 원문이 펼쳐진다', () => {
    const doc = '---\ntype: topic\ntags:\n  - a\n# 주석\nstatus: draft\n---\n본문\n\n끝'
    const v = open(doc)
    const chip = v.contentDOM.querySelector<HTMLButtonElement>('[data-testid="lp-properties"]')
    // 이름 2개(type·status) + 목록 키 tags — 들여 쓴 값·주석은 세지 않는다
    expect(chip?.textContent).toBe('속성 3개 · 펼치기')
    expect(v.contentDOM.textContent).not.toContain('type: topic')
    chip!.click()
    expect(v.state.selection.main.head).toBe(4)
    expect(v.contentDOM.querySelector('[data-testid="lp-properties"]')).toBeNull()
    expect(lineText(v, 2)).toBe('type: topic')
    // 글로 돌아가면 다시 접힌다 — 문서는 그대로
    v.dispatch({ selection: { anchor: v.state.doc.length } })
    expect(v.contentDOM.querySelector('[data-testid="lp-properties"]')).not.toBeNull()
    expect(v.state.doc.toString()).toBe(doc)
  })

  it('접힌 채 본문 첫 줄에서 ⌫ 를 누르면 보이지 않는 줄바꿈을 지우지 않고 펼친다', () => {
    const doc = '---\ntitle: a\n---\n본문'
    const v = open(doc, doc.indexOf('본문'))
    expect(v.contentDOM.querySelector('[data-testid="lp-properties"]')).not.toBeNull()
    deleteCharBackward(v)
    expect(v.state.doc.toString()).toBe(doc)
    expect(v.contentDOM.querySelector('[data-testid="lp-properties"]')).toBeNull()
    // 펼친 뒤의 ⌫ 는 보이는 글을 지우는 보통 편집이다
    v.dispatch({ selection: { anchor: '---\ntitle: a'.length } })
    deleteCharBackward(v)
    expect(v.state.doc.toString()).toBe('---\ntitle: \n---\n본문')
  })

  it('칩은 접힌 상태를 알리고 키보드 길(↑)을 말한다', () => {
    const v = open('---\ntitle: a\n---\n본문')
    const chip = v.contentDOM.querySelector('[data-testid="lp-properties"]')
    expect(chip?.getAttribute('aria-expanded')).toBe('false')
    expect(chip?.getAttribute('title')).toContain('↑')
  })

  it('닫히지 않은 --- 와 본문의 구분선은 속성 블록이 아니다', () => {
    const unclosed = open('---\ntitle: a\n본문', 0)
    expect(unclosed.contentDOM.querySelector('[data-testid="lp-properties"]')).toBeNull()
    unclosed.destroy()
    const hr = open('본문\n\n---\n\n끝')
    expect(hr.contentDOM.querySelector('[data-testid="lp-properties"]')).toBeNull()
    expect(hr.contentDOM.querySelector('.cm-lp-hr')).not.toBeNull()
  })

  it('CRLF 문서도 속성 블록을 접는다', () => {
    // CodeMirror 는 줄바꿈을 \n 으로 맞춰 든다 — 커서는 맞춘 길이 안에
    const doc = '---\r\ntitle: a\r\nstatus: b\r\n---\r\n본문'
    const v = open(doc, doc.replace(/\r/g, '').length)
    expect(v.contentDOM.querySelector('[data-testid="lp-properties"]')?.textContent).toBe(
      '속성 2개 · 펼치기'
    )
  })

  it('펼쳐 고친 속성은 다시 접혀 수를 세고, 되돌리기로 원래대로 돌아온다', () => {
    const doc = '---\ntitle: a\n---\n본문'
    const v = open(doc, doc.length, history())
    v.contentDOM.querySelector<HTMLButtonElement>('[data-testid="lp-properties"]')!.click()
    const at = '---\ntitle: a'.length
    v.dispatch({
      changes: { from: at, insert: '\nstatus: draft' },
      selection: { anchor: at },
      userEvent: 'input.type'
    })
    v.dispatch({ selection: { anchor: v.state.doc.length } })
    expect(v.contentDOM.querySelector('[data-testid="lp-properties"]')?.textContent).toBe(
      '속성 2개 · 펼치기'
    )
    undo(v)
    expect(v.state.doc.toString()).toBe(doc)
  })

  it('할 일 상자는 24px 누를 자리(label)에 싸여 있다', () => {
    const v = open('- [ ] 우유 사기\n\n끝')
    const hit = v.contentDOM.querySelector<HTMLLabelElement>('label.cm-lp-task-hit')
    expect(hit?.querySelector('input.cm-lp-task')).not.toBeNull()
  })
})

describe('bodyPosAt', () => {
  const text = '---\ntitle: a\n---\n하나\n둘\n셋\n넷\n다섯'
  const body = '---\ntitle: a\n---\n'.length
  it('비율이 없으면 속성 블록 바로 뒤', () => {
    expect(bodyPosAt(text)).toBe(body)
    expect(bodyPosAt(text, 0)).toBe(body)
    expect(bodyPosAt('속성 없음')).toBe(0)
  })
  it('리더 스크롤 비율에 맞는 본문 줄의 시작', () => {
    expect(bodyPosAt(text, 0.5)).toBe(body + '하나\n둘\n'.length)
    expect(bodyPosAt(text, 1)).toBe(text.length - '다섯'.length)
    expect(bodyPosAt(text, 7)).toBe(text.length - '다섯'.length)
  })
})

describe('livePreview — language switch', () => {
  afterEach(() => applyLanguage('ko'))

  it('이미 그려진 체크박스·속성 칩이 화면 언어를 따라 다시 만들어진다', () => {
    // 커서는 마지막 줄 — 커서가 있는 줄은 원문으로 보인다
    const v = open('---\ntitle: a\n---\n- [ ] 할 일\n\n끝')
    const box = (): string | null =>
      v.contentDOM.querySelector('.cm-lp-task')?.getAttribute('aria-label') ?? null
    const chip = (): string | null =>
      v.contentDOM.querySelector('[data-testid="lp-properties"]')?.textContent ?? null
    expect(box()).toBe('완료')
    expect(chip()).toBe('속성 1개 · 펼치기')
    applyLanguage('en')
    expect(box()).toBe('Done')
    expect(chip()).toBe('1 property · Expand')
  })
})
