import { describe, expect, it } from 'vitest'
import { fillTemplate, insertTemplate } from './insert-template'

const now = new Date(2026, 8, 22, 9, 5)

describe('fillTemplate', () => {
  it('제목·날짜·시각을 채운다', () => {
    expect(
      fillTemplate('# {{title}}\n{{date}} {{time}} {{date:YYYY}}', { title: '회의', now })
    ).toBe('# 회의\n2026-09-22 09:05 2026-09-22')
  })
})

describe('insertTemplate', () => {
  it('속성 없는 템플릿은 커서 자리에 그대로 넣는다', () => {
    expect(insertTemplate('앞\n뒤', 2, '## 할 일\n')).toEqual({
      text: '앞\n## 할 일\n뒤',
      cursor: 9
    })
  })

  it('속성 블록이 없는 문서에는 템플릿 속성을 맨 위에 만든다', () => {
    const out = insertTemplate('', 0, '---\ntype: topic\nup:\n---\n\n# 제목\n')
    expect(out.text).toBe('---\ntype: topic\nup:\n---\n# 제목\n')
    expect(out.text.slice(out.cursor)).toBe('')
  })

  it('있는 키는 문서 값을 두고, 없는 키만 더한다', () => {
    const doc = '---\ntype: note\n---\n본문\n'
    const out = insertTemplate(doc, doc.length, '---\ntype: topic\ntags: [a]\n---\n## 끝\n')
    expect(out.text).toBe('---\ntype: note\ntags:\n  - a\n---\n본문\n## 끝\n')
    expect(out.text.slice(0, out.cursor).endsWith('## 끝\n')).toBe(true)
  })

  it('커서가 속성 블록 안이면 본문 첫머리에 넣는다', () => {
    const doc = '---\na: 1\n---\n본문'
    expect(insertTemplate(doc, 4, 'X\n').text).toBe('---\na: 1\n---\nX\n본문')
  })

  it('깨진·맵 아닌 속성 템플릿은 본문만 넣고 속성은 건너뛴다', () => {
    const broken = insertTemplate('본문', 2, '---\na: [\n---\nT본문\n')
    expect(broken.text).toBe('본문T본문\n')
    expect(broken.text.slice(broken.cursor)).toBe('')
    const listed = insertTemplate('본문', 2, '---\n- a\n---\nT본문\n')
    expect(listed.text).toBe('본문T본문\n')
    expect(listed.text.slice(listed.cursor)).toBe('')
  })
})
