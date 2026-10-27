// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { marksFor } from './doc-marks'
import { WikilinkMarkdown } from './wikilink-markdown'
import { countHits, markCurrentHit } from './find-dom'

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(async () => ({ diagramType: 'flowchart' })),
  render: vi.fn(async () => ({ svg: '<svg data-fake="1"></svg>' }))
}))
vi.mock('mermaid', () => ({ default: mermaid }))

// React 19 act 경고를 끄는 전역 플래그
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

const body = ['- 하나', '- 둘', '', '바뀐 문단', '', '그대로인 문단'].join('\n')

type Marks = Parameters<typeof WikilinkMarkdown>[0]['marks']

let toggled: number[] = []
// 프롭은 변하지 않는 함수다 — 렌더마다 새로 주면 본문이 다시 마운트된다(그 계약을 테스트가 지킨다)
const onToggleCheckbox = (line: number): void => {
  toggled.push(line)
}
afterEach(() => {
  toggled = []
})

const mount = (marks?: Marks, text = body): { container: HTMLDivElement; draw: () => void } => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  const draw = (): void => {
    act(() =>
      root.render(
        <WikilinkMarkdown
          text={text}
          index={[]}
          marks={marks}
          onNavigate={() => {}}
          onOpenExternal={() => {}}
          onToggleCheckbox={onToggleCheckbox}
        />
      )
    )
  }
  draw()
  return { container, draw }
}

const render = (marks?: Marks, text = body): HTMLDivElement => mount(marks, text).container

describe('WikilinkMarkdown 의 바뀐 곳', () => {
  it('바뀐 줄이 걸친 문단에만 막대를 붙인다', () => {
    const container = render(marksFor(body, { added: [{ from: 4, to: 4 }], removed: [] }, 0))
    const marked = container.querySelectorAll('[data-testid="changed-mark"]')
    expect(marked).toHaveLength(1)
    expect(marked[0].textContent).toBe('바뀐 문단')
  })

  it('표시가 없으면 아무 막대도 붙이지 않는다', () => {
    expect(render().querySelectorAll('[data-testid="changed-mark"]')).toHaveLength(0)
  })

  it('지운 글은 접힌 채 그 줄 앞에 붙고, 누르면 펼쳐진다', () => {
    const container = render(
      marksFor(body, { added: [], removed: [{ after: 1, text: '- 지운 줄' }] }, 0)
    )
    const fold = container.querySelector('[data-testid="changed-removed"]')
    expect(fold?.textContent).toBe('지운 글 1줄')
    // 목록 안에서 지운 줄이라 목록 밖으로 새지 않는다
    expect(fold?.closest('li')).not.toBeNull()

    act(() => {
      fold?.querySelector('button')?.click()
    })
    expect(container.querySelector('pre')?.textContent).toBe('- 지운 줄')
  })

  it('인용문 안의 문단은 한 번만 표시한다 — 안팎이 겹쳐 막대가 두 겹이 되지 않는다', () => {
    const quote = ['> 인용 문단', '', '다음 문단'].join('\n')
    const container = render(
      marksFor(quote, { added: [{ from: 1, to: 1 }], removed: [{ after: 1, text: '지운 줄' }] }, 0),
      quote
    )
    expect(container.querySelectorAll('[data-testid="changed-mark"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-testid="changed-removed"]')).toHaveLength(1)
  })

  it('같은 표시로 다시 그려도 펼친 지운 글이 접히지 않는다', () => {
    const { container, draw } = mount(
      marksFor(body, { added: [], removed: [{ after: 1, text: '- 지운 줄' }] }, 0)
    )
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="changed-removed"] button')?.click()
    })
    expect(container.querySelector('pre')).not.toBeNull()
    draw()
    expect(container.querySelector('pre')).not.toBeNull()
  })

  it('중첩 목록에서 바뀐 줄은 안쪽 항목에만 표시한다 — 막대가 두 겹이 되지 않는다', () => {
    const nested = ['- 바깥', '  - 안쪽 바뀐 줄', '- 둘'].join('\n')
    const container = render(
      marksFor(nested, { added: [{ from: 2, to: 2 }], removed: [] }, 0),
      nested
    )
    const marked = container.querySelectorAll('[data-testid="changed-mark"]')
    expect(marked).toHaveLength(1)
    expect(marked[0].textContent).toBe('안쪽 바뀐 줄')
  })

  it('바깥 항목의 제 줄이 바뀌면 바깥에 표시한다 — 안쪽에 가려 사라지지 않는다', () => {
    const nested = ['- 바깥 바뀐 줄', '  - 안쪽', '- 둘'].join('\n')
    const container = render(
      marksFor(nested, { added: [{ from: 1, to: 1 }], removed: [] }, 0),
      nested
    )
    const marked = container.querySelectorAll('[data-testid="changed-mark"]')
    expect(marked).toHaveLength(1)
    expect(marked[0].textContent).toContain('바깥 바뀐 줄')
  })
})

describe('WikilinkMarkdown 의 검토 리더', () => {
  it('헤딩마다 목차와 같은 이름표를 붙인다 — 같은 이름이면 뒤엣것이 -2', () => {
    const container = render(undefined, '## 할 일\n\n글\n\n## 할 일\n\n글')
    expect([...container.querySelectorAll('h2')].map((h) => h.id)).toEqual(['할-일', '할-일-2'])
  })

  it('체크박스를 누르면 그 줄 번호를 알린다 — 본문 기준 줄이다', () => {
    const container = render(undefined, '# 제목\n\n- [ ] 가\n- [x] 나')
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect([...boxes].map((box) => box.checked)).toEqual([false, true])
    act(() => boxes[1].click())
    expect(toggled).toEqual([4])
  })

  // 스크린리더는 체크박스만 읽는다 — 이름이 없으면 무슨 일인지 모른다
  it('체크박스 이름은 항목 글자다 — 안쪽 목록은 빼고', () => {
    const container = render(undefined, '- [ ] **장보기** [[우유]]\n  - [x] 달걀')
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect([...boxes].map((box) => box.getAttribute('aria-label'))).toEqual(['장보기 우유', '달걀'])
  })

  // 목록 표식과 체크박스가 같이 보이면 항목마다 마커가 둘이다
  it('체크박스 항목에는 목록 표식을 남기지 않는다', () => {
    const container = render(undefined, '- [ ] 가\n- 보통 항목')
    const items = container.querySelectorAll('li')
    expect(items[0].className).toContain('task-item')
    expect(items[1].className).not.toContain('task-item')
    expect(items[0].querySelectorAll('input')).toHaveLength(1)
  })

  it('누를 곳이 없으면 체크박스를 잠근다 — 근거 시트는 읽기만 한다', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() =>
      root.render(
        <WikilinkMarkdown
          text={'- [ ] 가'}
          index={[]}
          onNavigate={() => {}}
          onOpenExternal={() => {}}
        />
      )
    )
    expect(container.querySelector<HTMLInputElement>('input')?.disabled).toBe(true)
  })

  it('바뀐 곳 표시와 체크박스가 한 항목에 같이 온다', () => {
    const text = '- [ ] 가\n- [ ] 나'
    const container = render(marksFor(text, { added: [{ from: 2, to: 2 }], removed: [] }, 0), text)
    const marked = container.querySelector('[data-testid="changed-mark"]')
    expect(marked?.tagName).toBe('LI')
    expect(marked?.querySelector('input')).not.toBeNull()
  })
})

describe('WikilinkMarkdown 의 "열린 항목만"', () => {
  const NOTE = [
    '## 끝난 절',
    '- [x] 끝난 항목',
    '',
    '## 남은 절',
    '- [x] 끝난 항목 둘',
    '- [ ] 남은 항목',
    '',
    '## 메모',
    '체크박스 없는 절'
  ].join('\n')

  const openOnly = (on: boolean): HTMLDivElement => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() =>
      root.render(
        <WikilinkMarkdown
          text={NOTE}
          index={[]}
          openOnly={on}
          onNavigate={() => {}}
          onOpenExternal={() => {}}
        />
      )
    )
    return container
  }

  // 절 제목은 남는다 — 목차가 그 절을 계속 보여 주므로 지우면 눌러도 갈 데가 없는 행이 된다
  it('끝난 항목과 전부 끝난 절의 글을 감춘다 — 절 제목과 체크박스 없는 절은 남는다', () => {
    const container = openOnly(true)
    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      '끝난 절',
      '남은 절',
      '메모'
    ])
    expect([...container.querySelectorAll('li')].map((li) => li.textContent?.trim())).toEqual([
      '남은 항목'
    ])
    expect(container.textContent).toContain('체크박스 없는 절')
  })

  it('끝난 항목 안에 남은 항목이 있으면 그 항목을 감추지 않는다', () => {
    const nested = ['- [x] 끝난 부모', '  - [ ] 남은 자식', '- [x] 혼자 끝난 항목'].join('\n')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() =>
      root.render(
        <WikilinkMarkdown
          text={nested}
          index={[]}
          openOnly
          onNavigate={() => {}}
          onOpenExternal={() => {}}
        />
      )
    )
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(container.textContent).toContain('끝난 부모')
    expect(container.textContent).toContain('남은 자식')
    // 자식이 없는 끝난 항목은 그대로 감춘다
    expect(container.textContent).not.toContain('혼자 끝난 항목')
  })

  it('끄면 전부 다시 보인다', () => {
    const container = openOnly(false)
    expect(container.querySelectorAll('h2')).toHaveLength(3)
    expect(container.querySelectorAll('li')).toHaveLength(3)
  })
})

describe('WikilinkMarkdown 의 임베드', () => {
  const embedOf = (text: string, onOpenFile?: (rel: string) => void): HTMLDivElement => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() =>
      root.render(
        <WikilinkMarkdown
          text={text}
          index={[]}
          onNavigate={() => {}}
          onOpenExternal={() => {}}
          onOpenFile={onOpenFile}
        />
      )
    )
    return container
  }

  it('그림은 그림으로 그린다', () => {
    const img = embedOf('![[raw/사진.png]]').querySelector('img')
    expect(img?.getAttribute('src')).toBe('vault://local/raw/%EC%82%AC%EC%A7%84.png')
  })

  it('소리는 플레이어로 그린다 — 깨진 그림이 아니다', () => {
    const container = embedOf('![[raw/녹음.mp3]]')
    expect(container.querySelector('img')).toBeNull()
    const audio = container.querySelector('[data-testid="sources-audio"]')
    expect(audio?.tagName).toBe('AUDIO')
  })

  it('영상은 영상으로 그린다', () => {
    const container = embedOf('![[raw/회의.mp4]]')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-testid="sources-video"]')?.tagName).toBe('VIDEO')
  })

  it('그 밖 파일은 이름으로 보이고 누르면 연다', () => {
    const opened: string[] = []
    const container = embedOf('![[raw/보고서.pdf]]', (rel) => opened.push(rel))
    const link = container.querySelector<HTMLButtonElement>('[data-testid="embed-file"]')
    expect(link?.textContent).toBe('보고서.pdf')
    act(() => link?.click())
    expect(opened).toEqual(['raw/보고서.pdf'])
  })

  it('여는 길이 없으면 이름만 보인다', () => {
    const link = embedOf('![[raw/보고서.pdf]]').querySelector('[data-testid="embed-file"]')
    expect(link?.tagName).toBe('SPAN')
  })
})

describe('WikilinkMarkdown 의 외부 링크 살균', () => {
  const linksOf = (
    text: string,
    onOpenExternal: (url: string) => void = () => {}
  ): HTMLDivElement => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() =>
      root.render(
        <WikilinkMarkdown
          text={text}
          index={[]}
          onNavigate={() => {}}
          onOpenExternal={onOpenExternal}
        />
      )
    )
    return container
  }

  // 허용 목록 밖 스킴은 눌러도 아무 일도 안 나게 글자로 둔다 — chat-markdown 과 같은 규칙
  it.each([
    '[보기](javascript:alert(1))',
    '[보기](JaVaScRiPt:alert(1))',
    '[보기](&#106;avascript:alert(1))',
    '[보기](data:text/html,<script>alert(1)</script>)',
    '[보기](file:///etc/passwd)',
    '[보기](vbscript:msgbox(1))',
    '[보기]( javascript:alert(1))'
  ])('%s 는 링크가 아니라 글자로 보인다', (text) => {
    const container = linksOf(text)
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('보기')
  })

  it('http·https·mailto 는 그대로 열리고, 누르면 외부로만 연다', () => {
    const opened: string[] = []
    const container = linksOf(
      '[웹](https://example.com) [메일](mailto:a@b.c) [대문자](HTTPS://example.com)',
      (url) => opened.push(url)
    )
    const links = [...container.querySelectorAll('a')]
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://example.com',
      'mailto:a@b.c',
      'HTTPS://example.com'
    ])
    for (const a of links) act(() => a.click())
    expect(opened).toEqual(['https://example.com', 'mailto:a@b.c', 'HTTPS://example.com'])
  })
})

describe('find — 리더 형광이 react-markdown 을 거쳐 그려진다(test: rehype-find.ts · find-dom.ts)', () => {
  const NOTE = [
    '## 끝난 절',
    '- [x] 회의 정리',
    '',
    '## 남은 절',
    '- [ ] 회의 준비',
    '',
    '`회의` 코드'
  ].join('\n')
  const mount = (on: boolean, query: string): HTMLDivElement => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() =>
      root.render(
        <WikilinkMarkdown
          text={NOTE}
          index={[]}
          openOnly={on}
          find={{ query }}
          onNavigate={() => {}}
          onOpenExternal={() => {}}
        />
      )
    )
    return container
  }

  it('일치마다 mark[data-hit], 코드 안도 센다', () => {
    const container = mount(false, '회의')
    expect(container.querySelectorAll('mark[data-hit]')).toHaveLength(3)
    expect(container.querySelector('code mark[data-hit]')?.textContent).toBe('회의')
  })

  it('"열린 항목만" 이 접은 블록의 일치는 그려지지 않아 총계·지금 자리가 화면과 맞는다', () => {
    const container = mount(true, '회의')
    expect(countHits(container)).toBe(2)
    markCurrentHit(container, 0)
    expect(container.querySelector('mark[data-current]')?.textContent).toBe('회의')
    expect(container.querySelector('mark[data-current]')?.closest('li')?.textContent).toContain(
      '준비'
    )
  })
})

describe('WikilinkMarkdown 의 Mermaid', () => {
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) await act(async () => undefined)
  }

  const draw = (text: string): HTMLDivElement => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() =>
      root.render(
        <WikilinkMarkdown text={text} index={[]} onNavigate={() => {}} onOpenExternal={() => {}} />
      )
    )
    return container
  }

  it('mermaid 코드 블록은 그림으로 그린다', async () => {
    vi.clearAllMocks()
    const container = draw('```mermaid\ngraph TD; A-->B\n```')
    await flush()
    expect(mermaid.render).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="wiki-mermaid"] svg')).not.toBeNull()
  })

  it('그리지 못하면 원문 코드와 사유를 보인다', async () => {
    vi.clearAllMocks()
    mermaid.parse.mockRejectedValueOnce(new Error('Parse error'))
    const container = draw('```mermaid\ngraph TD; A-->\n```')
    await flush()
    expect(mermaid.render).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="wiki-mermaid-fallback"]')?.textContent).toContain(
      'graph TD'
    )
  })

  it('mermaid 가 아닌 코드 블록은 그대로 코드로 보인다', () => {
    const container = draw('```ts\nconst x = 1\n```')
    expect(container.querySelector('[data-testid="wiki-mermaid"]')).toBeNull()
    expect(container.querySelector('pre code')?.textContent).toContain('const x = 1')
  })
})

describe('WikilinkMarkdown 의 바깥 링크', () => {
  it('그냥 누르면 앱 안으로, ⌘/Ctrl 을 누르고 누르면 바깥으로 열라고 알린다', () => {
    const opened: [string, { external?: boolean } | undefined][] = []
    const onOpenExternal = (url: string, options?: { external?: boolean }): void => {
      opened.push([url, options])
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() =>
      root.render(
        <WikilinkMarkdown
          text="[바깥](https://a.example/)"
          index={[]}
          onNavigate={() => {}}
          onOpenExternal={onOpenExternal}
        />
      )
    )
    const link = container.querySelector('a')!
    act(() => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    act(() =>
      link.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
      )
    )
    expect(opened).toEqual([
      ['https://a.example/', { external: false }],
      ['https://a.example/', { external: true }]
    ])
  })
})
