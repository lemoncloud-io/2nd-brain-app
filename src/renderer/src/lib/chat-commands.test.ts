import { describe, expect, it } from 'vitest'
import { matchSkills, mentionQuery, slashQuery } from './chat-commands'

describe('slashQuery — test: chat-commands.ts', () => {
  it('입력 맨 앞 `/이름` 까지만 메뉴 조각이다 — 띄어쓰기를 치면 닫힌다', () => {
    expect(slashQuery('/')).toBe('')
    expect(slashQuery('/va')).toBe('va')
    expect(slashQuery('/vault-reach ')).toBeNull()
    expect(slashQuery('묻는다 /va')).toBeNull()
  })
})

describe('matchSkills — test: chat-commands.ts', () => {
  const skills = [
    { name: 'vault-reach', description: '고아 문서 찾기' },
    { name: 'pdf2md-ingest' },
    { name: 'caveman:caveman' }
  ]

  it('빈 조각이면 전부 이름순, 이름이 조각으로 시작하는 것이 먼저', () => {
    expect(matchSkills(skills, '').map((s) => s.name)).toEqual([
      'caveman:caveman',
      'pdf2md-ingest',
      'vault-reach'
    ])
    expect(matchSkills(skills, 'cave').map((s) => s.name)).toEqual(['caveman:caveman'])
    expect(matchSkills(skills, 'ingest').map((s) => s.name)).toEqual(['pdf2md-ingest'])
  })

  it('설명으로도 찾고, 대소문자를 가리지 않는다', () => {
    expect(matchSkills(skills, '고아').map((s) => s.name)).toEqual(['vault-reach'])
    expect(matchSkills(skills, 'VAULT').map((s) => s.name)).toEqual(['vault-reach'])
    expect(matchSkills(skills, '없는것')).toEqual([])
  })
})

describe('mentionQuery — test: chat-commands.ts', () => {
  it('줄 처음이나 띄어쓰기 뒤 `@` 부터 커서까지', () => {
    expect(mentionQuery('@회의', 3)).toEqual({ start: 0, query: '회의' })
    expect(mentionQuery('이것과 @예', 6)).toEqual({ start: 4, query: '예' })
    expect(mentionQuery('이것과 @', 5)).toEqual({ start: 4, query: '' })
  })

  it('메일 주소·띄어쓰기를 친 뒤는 잡지 않는다', () => {
    expect(mentionQuery('me@home', 7)).toBeNull()
    expect(mentionQuery('@회의 뒤', 5)).toBeNull()
    expect(mentionQuery('없음', 2)).toBeNull()
  })
})
