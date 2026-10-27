import { describe, expect, it } from 'vitest'
import { readDefect } from './verify-defect'

describe('readDefect', () => {
  it('페이지 경로·줄 번호와 고칠 방법을 읽는다', () => {
    expect(readDefect('wiki/a.md:3 tab used for indentation (YAML forbids tabs)')).toEqual({
      rel: 'wiki/a.md',
      line: 3,
      fix: '속성 블록 들여쓰기에 탭이 있어요. 공백으로 바꿔 주세요',
      message: 'tab used for indentation (YAML forbids tabs)'
    })
  })

  it('줄 번호가 없으면 null 이다', () => {
    expect(readDefect('wiki/VAULT_MEMORY.md is missing')).toMatchObject({
      rel: 'wiki/VAULT_MEMORY.md',
      line: null,
      fix: '보관함 기억 파일이 없어요. 위키화를 다시 실행해 주세요',
      message: 'is missing'
    })
  })

  it('중복 키는 틀 규칙(frontmatter 일반)보다 먼저 맞는다', () => {
    expect(
      readDefect('wiki/b.md:7 duplicate key `tags` at the same level — the later value wins').fix
    ).toBe('속성 블록에 같은 이름이 두 번 있어요. 하나만 남겨 주세요')
  })

  it('next_action 결함은 세 모양마다 고칠 방법이 다르다', () => {
    const DOC = '(docs/project-next-action.md)'
    expect(
      readDefect(
        `wiki/a.md:3 next_action item 2 uses ';' to join clauses — each clause is its own sequence item ${DOC}`
      )
    ).toMatchObject({
      rel: 'wiki/a.md',
      line: 3,
      fix: '다음 할 일 한 줄에 여러 개가 붙어 있어요. 한 줄에 하나씩 나눠 주세요'
    })
    expect(
      readDefect(
        `wiki/a.md:2 next_action scalar is 303 bytes (max 300) — one action per item, detail in the body ${DOC}`
      ).fix
    ).toBe('다음 할 일 한 줄이 너무 길어요. 자세한 내용은 본문으로 옮겨 주세요')
    expect(
      readDefect(
        `wiki/a.md:2 next_action must be a quoted scalar or a block sequence, not an inline flow sequence — one item per line ${DOC}`
      ).fix
    ).toBe(
      '다음 할 일을 한 칸에 묶거나 여러 줄로 쓰지 말고, 한 줄 글 하나나 한 줄에 하나씩인 목록으로 써 주세요'
    )
    expect(
      readDefect(
        `wiki/a.md:2 next_action must be a quoted scalar or a block sequence, not a block scalar — a value with line breaks is unreadable in the base table cell ${DOC}`
      ).fix
    ).toBe(
      '다음 할 일을 한 칸에 묶거나 여러 줄로 쓰지 말고, 한 줄 글 하나나 한 줄에 하나씩인 목록으로 써 주세요'
    )
  })

  it('하위 경로의 wiki/ 는 위키 페이지가 아니고, 경로가 문구 중간이면 원문을 그대로 둔다', () => {
    expect(readDefect('append-only violation (M): raw/wiki/x.md').rel).toBeNull()
    expect(readDefect('could not read (wiki/c.md) now').message).toBe(
      'could not read (wiki/c.md) now'
    )
  })

  it('모르는 결함은 원문을 두고 확인만 권한다', () => {
    expect(readDefect('something new happened')).toEqual({
      rel: null,
      line: null,
      fix: '페이지를 열어 문제를 확인해 주세요',
      message: 'something new happened'
    })
  })
})
