// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { WikiListEntry } from '../../../../shared/ipc-contract'
import { useWorkbench } from '../../store/workbench'
import { useBacklinks } from './use-wiki-read'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  useWorkbench.setState({ pages: null })
})

const page = (rel: string, targets: string[]): WikiListEntry => ({
  rel,
  slug: rel.replace(/^wiki\//, '').replace(/\.md$/, ''),
  title: rel,
  frontmatter: null,
  links: targets.map((target) => ({ target })),
  mtimeMs: 0,
  size: 0
})

const Probe = ({ rel }: { rel: string | null }): React.JSX.Element => {
  const backlinks = useBacklinks(rel)
  return (
    <p data-testid="probe">{backlinks === null ? 'null' : backlinks.map((b) => b.rel).join(',')}</p>
  )
}

const mount = (rel: string | null): (() => string) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<Probe rel={rel} />))
  return () => container.querySelector('[data-testid="probe"]')?.textContent ?? ''
}

describe('useBacklinks — test: use-wiki-read.ts', () => {
  it('목록이 push 되면 다시 열지 않아도 목록이 바뀐다', () => {
    useWorkbench.setState({ pages: [page('wiki/a.md', []), page('wiki/b.md', [])] })
    const text = mount('wiki/b.md')
    expect(text()).toBe('')
    act(() => useWorkbench.setState({ pages: [page('wiki/a.md', ['b']), page('wiki/b.md', [])] }))
    expect(text()).toBe('wiki/a.md')
  })

  it('위키 목록에 없는 문서(projects·raw)·빈 탭은 null — 구역을 그리지 않는다', () => {
    useWorkbench.setState({ pages: [page('wiki/a.md', ['projects/x/README'])] })
    expect(mount('projects/x/README.md')()).toBe('null')
    expect(mount(null)()).toBe('null')
  })
})
