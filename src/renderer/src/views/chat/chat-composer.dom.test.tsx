// @vitest-environment jsdom
// 압축 확인 — 요약 대상 개수와 되돌릴 수 없는 이유를 확정 전에 보인다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChatComposer } from './chat-composer'
import type { ChatSession } from './use-chat-session'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

const chat = (messages: ChatSession['messages'], usage: ChatSession['usage'] = null): ChatSession =>
  ({
    messages,
    running: false,
    draft: '',
    usage,
    compacting: false,
    notice: null,
    compact: vi.fn(),
    images: []
  }) as unknown as ChatSession

const assist = {
  chips: null,
  menu: null,
  assistCount: 0,
  trackCaret: () => undefined,
  onKeyDown: () => undefined,
  assistOpen: false,
  assistActiveId: undefined,
  submit: () => undefined
}

const mount = (
  messages: ChatSession['messages'],
  opts: { usage?: ChatSession['usage']; showMeters?: boolean } = {}
): void => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(
      <ChatComposer
        chat={chat(messages, opts.usage ?? null)}
        assist={assist as never}
        heavy={false}
        newConversation={() => undefined}
        pastedUrl={null}
        onAddUrl={() => undefined}
        onDismissUrl={() => undefined}
        onPasteUrl={() => undefined}
        clipNote={null}
        onRequestIngest={() => undefined}
        dragOver={false}
        onDragOver={() => undefined}
        onDropFiles={() => undefined}
        inputRef={createRef()}
        pickerRef={createRef()}
        showMeters={opts.showMeters ?? false}
        compactAsk={true}
        onCompactAsk={() => undefined}
      />
    )
  })
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

describe('ChatComposer — 압축 미리보기', () => {
  it('요약 대상 개수와 되돌릴 수 없는 이유를 보인다', () => {
    mount([
      { role: 'user', text: '질문 하나' },
      { role: 'assistant', text: '답 하나' },
      { role: 'user', text: '질문 둘' }
    ] as ChatSession['messages'])
    const preview = document.querySelector('[data-testid="chat-compact-preview"]')
    expect(preview).not.toBeNull()
    expect(preview!.textContent).toContain('3개 메시지')
    expect(preview!.textContent).toContain('질문 2')
    expect(preview!.textContent).toContain('되돌릴 수 없는 이유')
  })
})

describe('ChatComposer — 압축 옆 사용량', () => {
  it('값이 오면 고급 표시가 꺼져도 압축 옆에 모델·기억을 보인다', () => {
    mount([{ role: 'user', text: '질문' } as ChatSession['messages'][number]], {
      usage: { model: 'claude-opus-4-6', contextPercent: 42 }
    })
    const usage = document.querySelector('[data-testid="chat-compact-usage"]')
    expect(usage).not.toBeNull()
    expect(usage!.textContent).toContain('기억 42%')
    // 압축 단추는 같은 줄에 그대로 있다
    expect(document.querySelector('[data-testid="chat-compact"]')).not.toBeNull()
  })

  it('값이 없으면 압축 옆에 아무것도 붙지 않는다', () => {
    mount([{ role: 'user', text: '질문' } as ChatSession['messages'][number]])
    expect(document.querySelector('[data-testid="chat-compact-usage"]')).toBeNull()
    expect(document.querySelector('[data-testid="chat-compact"]')).not.toBeNull()
  })

  it('빈 대화에는 압축 버튼 자리도 내지 않는다', () => {
    mount([])
    expect(document.querySelector('[data-testid="chat-compact"]')).toBeNull()
    expect(document.querySelector('[data-testid="chat-compact-usage"]')).toBeNull()
  })

  it('고급 표시가 켜져 있으면 지표 줄이 보여주므로 중복 표시하지 않는다', () => {
    ;(window as unknown as { api: unknown }).api = {
      getAccountUsage: () => Promise.resolve(null)
    }
    mount([{ role: 'user', text: '질문' } as ChatSession['messages'][number]], {
      usage: { model: 'claude-opus-4-6', contextPercent: 42 },
      showMeters: true
    })
    expect(document.querySelector('[data-testid="chat-compact-usage"]')).toBeNull()
    expect(document.querySelector('[data-testid="chat-status-bar"]')).not.toBeNull()
  })
})
