import { describe, expect, it } from 'vitest'
import {
  EMPTY_PLACE,
  afterClose,
  emptyTab,
  relocateTab,
  tabLabel,
  tabLabels,
  webTabIds
} from './tabs'

describe('webTabIds — 웹 view 를 가진 탭', () => {
  it('켜진 탭은 live 웹 자리로, 나머지는 탭 칸으로 본다', () => {
    const page = { url: 'https://a.example/', title: 'A' }
    const tabs = [{ ...emptyTab(), web: page }, emptyTab(), { ...emptyTab(), web: null }]
    // 켜진 탭(2번)의 칸은 낡았다 — live 가 웹이면 그 탭도 센다
    expect(webTabIds(tabs, 2, page)).toEqual([tabs[0].id, tabs[2].id])
    expect(webTabIds(tabs, 0, null)).toEqual([])
  })
})

describe('tabLabel', () => {
  it('파일이면 이름만 — md 는 확장자도 뗀다', () => {
    expect(tabLabel({ ...EMPTY_PLACE, page: 'wiki/topics/graph.md' })).toBe('graph')
    expect(tabLabel({ ...EMPTY_PLACE, docMode: 'source', source: 'raw/shot 1.png' })).toBe(
      'shot 1.png'
    )
  })

  it('뷰면 메뉴 이름, 빈 자리면 새 탭', () => {
    expect(tabLabel({ ...EMPTY_PLACE, view: 'knowledge' })).toBe('지식 관리')
    expect(tabLabel(EMPTY_PLACE)).toBe('새 탭')
  })

  it('웹 탭은 페이지 제목, 없으면 호스트, 주소 전이면 "새 웹 페이지"', () => {
    const web = { ...EMPTY_PLACE, view: 'web' as const }
    expect(tabLabel({ ...web, web: { url: 'https://a.example/x', title: '기사' } })).toBe('기사')
    expect(tabLabel({ ...web, web: { url: 'https://a.example/x', title: '' } })).toBe('a.example')
    expect(tabLabel({ ...web, web: { url: null, title: '' } })).toBe('새 웹 페이지')
    expect(tabLabel({ ...web, web: null })).toBe('새 웹 페이지')
  })

  it('미리보기 탭은 리더 쪽 값이 남아 있어도 보고 있는 파일을 적는다', () => {
    const place = {
      ...EMPTY_PLACE,
      page: 'wiki/a.md',
      source: 'raw/b.pdf',
      docMode: 'source' as const
    }
    expect(tabLabel(place)).toBe('b.pdf')
  })
})

describe('tabLabels', () => {
  const page = (rel: string): typeof EMPTY_PLACE => ({ ...EMPTY_PLACE, page: rel })

  it('이름이 같은 다른 문서가 같이 떠 있으면 바로 위 폴더를 붙인다', () => {
    expect(
      tabLabels([page('projects/dm/PLAN.md'), page('projects/docs/PLAN.md'), page('wiki/a.md')])
    ).toEqual(['dm · PLAN', 'docs · PLAN', 'a'])
  })

  it('겹치지 않으면 이름만, 같은 파일을 띄운 두 탭도 이름만이다', () => {
    expect(tabLabels([page('wiki/a.md'), page('wiki/a.md'), EMPTY_PLACE])).toEqual([
      'a',
      'a',
      '새 탭'
    ])
  })

  it('맨 위 파일은 붙일 폴더가 없어 이름만 남는다', () => {
    expect(tabLabels([page('PLAN.md'), page('wiki/PLAN.md')])).toEqual(['PLAN', '위키 · PLAN'])
  })
})

describe('afterClose', () => {
  const tabs = [emptyTab(), emptyTab(), emptyTab()]

  it('보던 탭을 닫으면 오른쪽 것이 켜진다', () => {
    expect(afterClose(tabs, 1, 1)).toBe(1)
  })

  it('맨 끝을 닫으면 왼쪽 것이 켜진다', () => {
    expect(afterClose(tabs, 2, 2)).toBe(1)
  })

  it('앞쪽 탭을 닫으면 보던 탭이 한 칸 당겨질 뿐이다', () => {
    expect(afterClose(tabs, 0, 2)).toBe(1)
  })

  it('뒤쪽 탭을 닫으면 보던 자리는 그대로다', () => {
    expect(afterClose(tabs, 2, 0)).toBe(0)
  })
})

describe('relocateTab', () => {
  it('이름이 바뀐 파일을 가리키던 자리를 새 자리로 옮긴다', () => {
    const tab = emptyTab({ ...EMPTY_PLACE, page: 'wiki/old.md' })
    const moved = relocateTab(tab, (rel) => (rel === 'wiki/old.md' ? 'wiki/new.md' : rel))
    expect(moved.page).toBe('wiki/new.md')
    expect(moved.id).toBe(tab.id)
  })

  it('지운 파일을 가리키던 자리는 비운다', () => {
    const tab = emptyTab({ ...EMPTY_PLACE, docMode: 'source', source: 'raw/gone.png' })
    expect(relocateTab(tab, () => null).source).toBeNull()
  })
})
