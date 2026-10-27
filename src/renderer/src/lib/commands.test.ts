// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { COMMANDS, availableCommands, commandForKey } from './commands'
import { useWorkbench } from '../store/workbench'

describe('commands — test: commands.ts', () => {
  it('단축키는 한 키에 하나, 표에 있는 것만 잡힌다', () => {
    const seen = new Set<string>()
    for (const c of COMMANDS) {
      if (!c.shortcut) continue
      const key = `${c.shortcut.alt ? 'alt+' : ''}${c.shortcut.code}`
      expect(seen.has(key), key).toBe(false)
      seen.add(key)
    }
    expect(commandForKey('KeyT', false)?.id).toBe('today')
    expect(commandForKey('KeyT', true)?.id).toBe('tab-new')
    expect(commandForKey('KeyZ', false)).toBeUndefined()
  })

  it('새 탭·숫자 탭 명령이 표에 있다 — 새 탭 열기는 팔레트에 안 보인다', () => {
    expect(commandForKey('KeyN', false)?.id).toBe('note-new')
    expect(commandForKey('Digit1', false)?.id).toBe('tab-1')
    expect(commandForKey('Digit8', false)?.id).toBe('tab-8')
    expect(commandForKey('Digit9', false)?.id).toBe('tab-last')
    useWorkbench.setState({ view: 'doc', selectedPage: null, paletteOpen: false, editing: null })
    const ids = availableCommands(useWorkbench.getState()).map((c) => c.id)
    expect(ids).not.toContain('note-new')
    expect(ids).not.toContain('tab-1')
    expect(ids).not.toContain('tab-last')
  })

  it('팔레트 목록은 지금 부를 수 있는 것만, 팔레트 자신은 뺀다', () => {
    useWorkbench.setState({ view: 'doc', selectedPage: null, paletteOpen: false, editing: null })
    const ids = availableCommands(useWorkbench.getState()).map((c) => c.id)
    expect(ids).not.toContain('palette')
    expect(ids).not.toContain('palette-commands')
    expect(ids).not.toContain('find')
    useWorkbench.setState({ selectedPage: 'wiki/a.md' })
    const withPage = availableCommands(useWorkbench.getState()).map((c) => c.id)
    expect(withPage).toEqual(expect.arrayContaining(['find', 'back', 'tab-new']))
    // 편집기가 열려 있으면 이동·오늘 노트·찾기는 목록에서 빠진다(초점 대신 store 편집 상태)
    useWorkbench.setState({ editing: 'wiki/a.md' })
    const whileEditing = availableCommands(useWorkbench.getState()).map((c) => c.id)
    expect(whileEditing).not.toContain('back')
    expect(whileEditing).not.toContain('today')
    expect(whileEditing).not.toContain('find')
    expect(whileEditing).toContain('tab-new')
    useWorkbench.setState({ editing: null })
  })

  it('아무 페이지나 열기는 지금 페이지 말고 고를 페이지가 있을 때만 보이고, 그 페이지로 간다', () => {
    const pages = (rels: string[]): ReturnType<typeof useWorkbench.getState>['pages'] =>
      rels.map((rel) => ({ rel })) as ReturnType<typeof useWorkbench.getState>['pages']
    const ids = (): string[] => availableCommands(useWorkbench.getState()).map((c) => c.id)
    useWorkbench.setState({
      view: 'doc',
      selectedPage: 'wiki/a.md',
      editing: null,
      pages: pages(['wiki/a.md', 'wiki/INDEX.md'])
    })
    expect(ids()).not.toContain('random-page')
    useWorkbench.setState({ pages: pages(['wiki/a.md', 'wiki/b.md']) })
    expect(ids()).toContain('random-page')
    COMMANDS.find((c) => c.id === 'random-page')!.run(useWorkbench.getState())
    expect(useWorkbench.getState().selectedPage).toBe('wiki/b.md')
    useWorkbench.setState({ pages: null, selectedPage: null })
  })
})
