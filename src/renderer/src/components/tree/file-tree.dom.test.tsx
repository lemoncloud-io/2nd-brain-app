// @vitest-environment jsdom
// 탭을 바꾸면 사이드바가 그 파일까지 따라간다 — 접힌 폴더는 펴지고, 행은 보이는 자리로 온다.
// 스크롤은 초점을 옮기지 않는다: 글을 쓰다 탭을 바꿨을 때 커서가 트리로 끌려가면 안 된다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { VaultTreeEntry } from '../../../../shared/ipc-contract'
import { useWorkbench } from '../../store/workbench'
import { FileTree } from './file-tree'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const VAULT = '/tmp/vault'

const entry = (rel: string, kind: 'dir' | 'file' = 'file'): VaultTreeEntry => ({
  rel,
  kind,
  ext: kind === 'dir' ? '' : rel.slice(rel.lastIndexOf('.')),
  mtimeMs: 0,
  size: 0
})

const TREE: VaultTreeEntry[] = [
  entry('wiki', 'dir'),
  entry('wiki/topics', 'dir'),
  entry('wiki/topics/deep.md'),
  entry('readme.md')
]

/** scrollIntoView 를 부른 행의 id 와 인자 — jsdom 에는 이 메서드가 아예 없다 */
let scrolled: { id: string; options: unknown }[] = []

const roots: Root[] = []

beforeEach(() => {
  scrolled = []
  // 원래 없는 메서드라 스파이가 아니라 대입이다. 되돌리기는 afterEach 의 delete —
  // 지우면 jsdom 본래의 "없음" 으로 정확히 돌아간다
  Element.prototype.scrollIntoView = function (this: Element, options?: unknown): void {
    scrolled.push({ id: this.id, options })
  } as Element['scrollIntoView']
  // 펼침 상태는 보관함별 localStorage 에 남는다 — 테스트마다 전부 접힌 채로 시작한다
  localStorage.clear()
  window.api = {
    checkboxCounts: () => Promise.resolve([])
  } as unknown as typeof window.api
  useWorkbench.setState({
    uiPrefs: { showFileExtensions: false, showChatMeters: false },
    changes: {},
    tree: TREE,
    treeError: null,
    vaultDir: VAULT,
    view: 'doc',
    docMode: 'page',
    selectedPage: null,
    selectedSource: null,
    editing: null
  } as never)
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  // 대입해 둔 메서드를 지워 jsdom 본래의 "없음" 으로 되돌린다
  delete (Element.prototype as Partial<Element>).scrollIntoView
})

const mount = (): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<FileTree />))
  return container
}

const open = (rel: string | null): void => {
  act(() => {
    useWorkbench.setState({ selectedPage: rel } as never)
  })
}

describe('FileTree — 열린 파일 따라가기', () => {
  it('열린 파일이 바뀌면 그 행을 보이는 자리로 옮긴다', () => {
    mount()
    open('wiki/topics/deep.md')

    // `nearest` 라야 이미 보이는 행은 가만히 둔다 — `center` 면 탭을 바꿀 때마다 사이드바가 튄다
    expect(scrolled).toEqual([
      { id: 'tree-item-wiki/topics/deep.md', options: { block: 'nearest', inline: 'nearest' } }
    ])
  })

  // 회귀(리뷰 2026-09-21): effect 가 `rows` 정체성에 걸려 있어, 자동저장 한 번에 트리가
  // 새로고침되면 사용자가 다른 데로 스크롤해 둔 사이드바가 열린 파일로 되튀었다.
  it('열린 파일이 그대로면 트리가 새로고침돼도 다시 옮기지 않는다', () => {
    mount()
    open('wiki/topics/deep.md')
    scrolled = []

    // 워처가 알려 온 새 트리 — 내용은 같지만 새 배열이라 rows 정체성이 바뀐다
    act(() => {
      useWorkbench.setState({ tree: [...TREE] } as never)
    })

    expect(scrolled).toEqual([])
  })

  it('다른 파일로 옮겨 가면 다시 따라간다', () => {
    mount()
    open('wiki/topics/deep.md')
    scrolled = []

    open('readme.md')

    expect(scrolled.map((s) => s.id)).toEqual(['tree-item-readme.md'])
  })

  it('접힌 폴더 안의 파일도 펴진 뒤 따라간다', () => {
    const container = mount()
    // 시작은 전부 접힘 — 깊은 행은 아직 없다
    expect(container.querySelector('#tree-item-wiki\\/topics\\/deep\\.md')).toBeNull()

    open('wiki/topics/deep.md')

    expect(container.querySelector('[id="tree-item-wiki/topics/deep.md"]')).not.toBeNull()
    expect(scrolled.map((s) => s.id)).toContain('tree-item-wiki/topics/deep.md')
  })

  it('열린 파일이 없으면 아무 행도 옮기지 않는다', () => {
    mount()
    open(null)

    expect(scrolled).toEqual([])
  })

  it('초점을 트리로 빼앗지 않는다', () => {
    mount()
    const elsewhere = document.createElement('textarea')
    document.body.appendChild(elsewhere)
    elsewhere.focus()

    open('wiki/topics/deep.md')

    expect(document.activeElement).toBe(elsewhere)
  })
})

describe('FileTree — 인라인으로 만들기', () => {
  const created: { folder: string; name?: string }[] = []

  const withCreateApi = (): void => {
    window.api = {
      checkboxCounts: () => Promise.resolve([]),
      createVaultFolder: (folder: string, name?: string) => {
        created.push({ folder, name })
        return Promise.resolve({ rel: folder === '' ? (name ?? '새 폴더') : `${folder}/${name}` })
      }
    } as unknown as typeof window.api
  }

  beforeEach(() => {
    created.length = 0
    withCreateApi()
  })

  const input = (c: HTMLElement): HTMLInputElement | null =>
    c.querySelector('[data-testid="tree-create-input"]')

  const click = (c: HTMLElement, testId: string): void => {
    act(() => {
      c.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click()
    })
  }

  const press = (el: HTMLInputElement, key: string): void => {
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    })
  }

  it('새 폴더를 누르면 이름 칸이 열리고 디스크에는 아직 아무것도 안 만든다', () => {
    const container = mount()
    click(container, 'tree-new-folder')

    expect(input(container)).not.toBeNull()
    expect(created).toEqual([])
  })

  it('Enter 를 쳐야 그 이름으로 만든다', () => {
    const container = mount()
    click(container, 'tree-new-folder')
    const el = input(container)!
    el.value = '기획'
    press(el, 'Enter')

    expect(created).toEqual([{ folder: '', name: '기획' }])
  })

  it('Esc 면 이름 칸만 닫고 아무것도 만들지 않는다', () => {
    const container = mount()
    click(container, 'tree-new-folder')
    press(input(container)!, 'Escape')

    expect(created).toEqual([])
    expect(input(container)).toBeNull()
  })

  // 회귀(요구 4): 예전에는 누를 때마다 바로 만들고 초점을 새 폴더로 옮겨, 연타하면
  // 갓 만든 폴더 안에 또 폴더가 생겼다. 이제 이름을 확정해야 다음이 시작된다.
  // 단추를 다시 누르면 실제 브라우저는 입력의 초점을 먼저 뺏는다(mousedown) — jsdom 의
  // programmatic click 은 그러지 않으므로 blur 를 손으로 일으켜 그 순서를 재현한다
  it('연타해도 이름 칸 하나만 열리고 중첩이 생기지 않는다', () => {
    const container = mount()
    for (let n = 0; n < 3; n += 1) {
      act(() => {
        input(container)?.blur()
      })
      click(container, 'tree-new-folder')
    }

    expect(container.querySelectorAll('[data-testid="tree-create-input"]')).toHaveLength(1)
    expect(created).toEqual([])
  })

  // 초점만 잃어도 만들어 버리면 치지도 않은 "새 폴더" 가 디스크에 남는다
  it('초점을 잃으면 만들지 않고 이름 칸을 닫는다', () => {
    const container = mount()
    click(container, 'tree-new-folder')
    act(() => {
      input(container)!.blur()
    })

    expect(created).toEqual([])
    expect(input(container)).toBeNull()
  })

  it('만들지 못하면 이름 칸을 열어 둔 채 친 이름을 지킨다', async () => {
    window.api = {
      checkboxCounts: () => Promise.resolve([]),
      createVaultFolder: () => Promise.resolve({ error: '같은 자리에 "기획" 이 이미 있다' })
    } as unknown as typeof window.api
    const container = mount()
    click(container, 'tree-new-folder')
    const el = input(container)!
    el.value = '기획'
    press(el, 'Enter')
    await act(async () => {
      await Promise.resolve()
    })

    expect(input(container)?.value).toBe('기획')
    expect(container.textContent).toContain('이미 있다')
  })
})

describe('FileTree — 확장자 표시', () => {
  const row = (c: HTMLElement, rel: string): HTMLElement | null =>
    c.querySelector(`[data-testid="tree-file:${rel}"]`)

  it('꺼져 있으면 md 는 확장자를 숨긴다', () => {
    const container = mount()
    expect(row(container, 'readme.md')?.textContent).toContain('readme')
    expect(row(container, 'readme.md')?.textContent).not.toContain('.md')
  })

  it('켜면 적힌 이름 그대로 보인다', () => {
    const container = mount()
    act(() => {
      useWorkbench.setState({
        uiPrefs: { showFileExtensions: true, showChatMeters: false }
      } as never)
    })

    expect(row(container, 'readme.md')?.textContent).toContain('readme.md')
  })

  // 확장자를 숨긴 채 받은 이름은 확장자를 뗀 이름이다 — main 이 그걸 알아야 `.md` 를 도로 붙인다
  it('이름 바꾸기는 확장자를 보여 줬는지까지 알린다', () => {
    const renamed: { rel: string; name: string; nameHasExt?: boolean }[] = []
    window.api = {
      checkboxCounts: () => Promise.resolve([]),
      renameVaultEntry: (rel: string, name: string, nameHasExt?: boolean) => {
        renamed.push({ rel, name, nameHasExt })
        return Promise.resolve({ rel })
      },
      listVaultTree: () => Promise.resolve([])
    } as unknown as typeof window.api
    const container = mount()

    // F2 는 초점 행에 걸린다 — 행이 초점을 받아야 그 행이 이름 칸을 연다
    const target = row(container, 'readme.md')!
    // 진짜 초점을 준다(React 의 onFocus 는 focusin 을 듣는다). 초점과 F2 를 한 act 에 묶으면
    // 초점 상태가 아직 안 붙은 채로 F2 가 돌아 엉뚱한 행의 이름을 바꾼다
    act(() => target.focus())
    act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }))
    })
    const input = container.querySelector<HTMLInputElement>('[data-testid="tree-rename-input"]')
    expect(input).not.toBeNull()
    input!.value = '설명'
    act(() => {
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(renamed).toEqual([{ rel: 'readme.md', name: '설명', nameHasExt: false }])
  })

  it('확장자를 켜 두면 친 이름이 그대로 간다', () => {
    const renamed: { rel: string; name: string; nameHasExt?: boolean }[] = []
    window.api = {
      checkboxCounts: () => Promise.resolve([]),
      renameVaultEntry: (rel: string, name: string, nameHasExt?: boolean) => {
        renamed.push({ rel, name, nameHasExt })
        return Promise.resolve({ rel: name })
      },
      listVaultTree: () => Promise.resolve([])
    } as unknown as typeof window.api
    const container = mount()
    act(() => {
      useWorkbench.setState({
        uiPrefs: { showFileExtensions: true, showChatMeters: false }
      } as never)
    })

    const target = row(container, 'readme.md')!
    // 진짜 초점을 준다(React 의 onFocus 는 focusin 을 듣는다). 초점과 F2 를 한 act 에 묶으면
    // 초점 상태가 아직 안 붙은 채로 F2 가 돌아 엉뚱한 행의 이름을 바꾼다
    act(() => target.focus())
    act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }))
    })
    const input = container.querySelector<HTMLInputElement>('[data-testid="tree-rename-input"]')!
    input.value = 'readme.html'
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(renamed).toEqual([{ rel: 'readme.md', name: 'readme.html', nameHasExt: true }])
  })
})

describe('FileTree — 도구줄', () => {
  it('도구 모음에 이름이 있다', () => {
    const container = mount()
    expect(container.querySelector('[aria-label="파일 도구"]')).not.toBeNull()
  })

  it('정렬 단추에 지금 순서가 글자로 보인다', () => {
    const container = mount()
    const sort = container.querySelector('[data-testid="tree-sort"]')
    expect(sort?.textContent).toMatch(/이름순|최신순/)
  })

  it('폴더 행에 폴더 표시가 있다', () => {
    const container = mount()
    act(() => {
      useWorkbench.setState({ tree: [...TREE, entry('areas', 'dir')] } as never)
    })
    expect(
      container.querySelector('[data-testid="tree-dir:areas"] [data-testid="tree-folder-icon"]')
    ).not.toBeNull()
  })
})

describe('FileTree — 달라진 파일 배지', () => {
  const dot = (c: HTMLElement, rel: string): HTMLElement | null =>
    c.querySelector(`[data-testid="tree-change:${rel}"]`)

  it('평소 상태의 파일에는 아무 표시도 없다', () => {
    const container = mount()
    expect(dot(container, 'readme.md')).toBeNull()
  })

  // 색만으로 뜻을 나르면 색을 못 보는 사람에게는 표시가 없는 것과 같다
  it('바뀐 파일·새 파일을 말로도 알린다 — git 글자는 쓰지 않는다', () => {
    const container = mount()
    act(() => {
      useWorkbench.setState({
        changes: { 'readme.md': 'changed', 'wiki/topics/deep.md': 'new' }
      } as never)
    })

    expect(dot(container, 'readme.md')?.getAttribute('aria-label')).toBe('바뀐 파일')
    expect(container.textContent).not.toMatch(/\bM\b|untracked|porcelain/)
  })

  it('접힌 폴더는 안에 달라진 것이 있다는 점만 단다', () => {
    const container = mount()
    act(() => {
      useWorkbench.setState({ changes: { 'wiki/topics/deep.md': 'new' } } as never)
    })

    expect(dot(container, 'wiki')?.getAttribute('aria-label')).toBe('안에 달라진 것이 있어요')
    // 깊은 파일은 접혀 있어 행 자체가 없다
    expect(dot(container, 'wiki/topics/deep.md')).toBeNull()
  })

  it('보관함에 기록이 없으면(빈 맵) 점을 하나도 안 그린다', () => {
    const container = mount()
    act(() => {
      useWorkbench.setState({ changes: {} } as never)
    })

    expect(container.querySelectorAll('[data-testid^="tree-change:"]')).toHaveLength(0)
  })
})
