import { describe, expect, it } from 'vitest'
import { createLinkResolver } from './parse'
import { isWikiPagePath, pickKeep, planMerge, rewriteLinks, type MergePage } from './merge-pages'

const page = (rel: string, text: string, title?: string): MergePage => ({
  rel,
  slug: rel.replace(/^wiki\//, '').replace(/\.md$/, ''),
  title: title ?? rel.split('/').pop()!.replace(/\.md$/, ''),
  text
})

describe('isWikiPagePath', () => {
  it('wiki 아래 .md 만 — 우회 조각은 거부한다', () => {
    expect(isWikiPagePath('wiki/a.md')).toBe(true)
    expect(isWikiPagePath('wiki/topics/llm.md')).toBe(true)
    // 보관함 밖으로 나가는 우회 — 합치기 쓰기 게이트가 막는다
    expect(isWikiPagePath('wiki/../VAULT_RULES.md')).toBe(false)
    expect(isWikiPagePath('wiki/sub/../../VAULT_RULES.md')).toBe(false)
    expect(isWikiPagePath('wiki//a.md')).toBe(false)
    expect(isWikiPagePath('wiki/./a.md')).toBe(false)
    expect(isWikiPagePath('wiki/a.txt')).toBe(false)
    expect(isWikiPagePath('vault/a.md')).toBe(false)
    expect(isWikiPagePath('wiki/a')).toBe(false)
  })
})

describe('rewriteLinks', () => {
  const resolve = createLinkResolver([
    { rel: 'wiki/old.md', slug: 'old' },
    { rel: 'wiki/new.md', slug: 'new' }
  ])
  const run = (text: string): ReturnType<typeof rewriteLinks> =>
    rewriteLinks(text, resolve, 'wiki/old.md', 'new')

  it('옛 페이지를 가리키는 링크를 새 이름으로 바꾸고 #제목·|별칭은 지킨다', () => {
    const result = run('[[old]] 와 [[old#정의]] 그리고 [[old|옛 이름]], ![[old]], [[new]]')
    expect(result.text).toBe('[[new]] 와 [[new#정의]] 그리고 [[new|옛 이름]], ![[new]], [[new]]')
    expect(result.count).toBe(4)
  })

  it('코드 블록·인라인 코드·URL 안의 링크는 건드리지 않는다', () => {
    const text = [
      '```',
      '[[old]]',
      '```',
      '~~~md',
      '[[old]]',
      '~~~',
      '`[[old]]` 는 예시',
      'https://x.test/[[old]]',
      '본문 [[old]]'
    ].join('\n')
    const result = run(text)
    expect(result.count).toBe(1)
    expect(result.text.split('\n').at(-1)).toBe('본문 [[new]]')
    expect(result.text.split('\n').slice(0, -1)).toEqual(text.split('\n').slice(0, -1))
  })

  it('표 안의 [[이름\\|별칭]] 도 바꾸고 \\| 는 지킨다', () => {
    expect(run('| [[old\\|옛]] |').text).toBe('| [[new\\|옛]] |')
  })

  it('다른 문자·더 짧은 표식은 코드 블록을 닫지 않는다', () => {
    const text = [
      '~~~',
      '```',
      '[[old]]',
      '~~~',
      '[[old]]',
      '````',
      '```',
      '[[old]]',
      '````',
      '[[old]]'
    ].join('\n')
    expect(run(text).text).toBe(
      ['~~~', '```', '[[old]]', '~~~', '[[new]]', '````', '```', '[[old]]', '````', '[[new]]'].join(
        '\n'
      )
    )
  })

  it('속성 칸의 링크와 CRLF 줄도 바꾼다', () => {
    expect(run('---\r\nup: "[[old]]"\r\n---\r\n[[old]]\r\n').text).toBe(
      '---\r\nup: "[[new]]"\r\n---\r\n[[new]]\r\n'
    )
  })

  it('경로형·대소문자가 달라도 옛 페이지로 풀리면 바꾼다', () => {
    expect(run('[[wiki/OLD]] [[Old.md]]').text).toBe('[[new]] [[new]]')
  })
})

describe('pickKeep', () => {
  it('더 많이 가리켜지는 페이지를 남기고, 같으면 긴 쪽을 남긴다', () => {
    const a = page('wiki/a.md', 'a')
    const b = page('wiki/b.md', 'bbbb')
    const docs = [
      page('wiki/x.md', '[[a]] [[a]]'),
      page('wiki/y.md', '[[a]]'),
      page('wiki/z.md', '[[b]]')
    ]
    expect(pickKeep(a, b, [a, b, ...docs])).toEqual({ keep: a, drop: b })
    expect(pickKeep(a, b, [a, b])).toEqual({ keep: b, drop: a })
  })
})

describe('planMerge', () => {
  const keep = page(
    'wiki/new.md',
    '---\n# 메모\ntitle: 새 이름\naliases: [신규]\n---\n# 새 이름\n옛 본문\n',
    '새 이름'
  )
  const drop = page('wiki/old.md', '---\naliases:\n  - 구식\n---\n# 옛 이름\n', '옛 이름')
  const other = page('wiki/x.md', '[[old]] 참고\n')
  const quiet = page('wiki/y.md', '링크 없음\n')

  it('남길 페이지에 합친 본문을 넣고 옛 이름들을 aliases 에 더하며, 다른 페이지 링크를 고친다', () => {
    const plan = planMerge({
      keep,
      drop,
      docs: [keep, drop, other, quiet],
      body: '# 새 이름\n합친 본문 [[old]]\n'
    })
    expect(plan.keepText).toBe(
      '---\n# 메모\ntitle: 새 이름\naliases:\n  - 신규\n  - 옛 이름\n  - 구식\n---\n# 새 이름\n합친 본문 [[new]]\n'
    )
    expect(plan.edits).toEqual([{ rel: 'wiki/x.md', text: '[[new]] 참고\n', count: 1 }])
  })

  it('남길 페이지에 속성이 없으면 aliases 만 든 속성을 만든다', () => {
    const bare = page('wiki/new.md', '# 새\n', '새')
    const plan = planMerge({ keep: bare, drop, docs: [bare, drop], body: '본문\n' })
    expect(plan.keepText).toBe('---\naliases:\n  - 옛 이름\n  - 구식\n---\n본문\n')
  })

  it('남길 파일이 CRLF 면 합친 본문도 CRLF 로 맞춘다', () => {
    const crlf = page('wiki/new.md', '---\r\ntitle: 새\r\n---\r\n# 새\r\n', '새')
    const plan = planMerge({ keep: crlf, drop, docs: [crlf, drop], body: '# 새\n본문\n' })
    expect(plan.keepText).not.toMatch(/[^\r]\n/)
    expect(plan.keepText).toContain('# 새\r\n본문\r\n')
  })

  it('basename 이 겹치면 남길 페이지를 경로형 이름으로 건다', () => {
    const deep = page('wiki/b/new.md', '# 깊은\n', '깊은')
    const twin = page('wiki/a/new.md', '# 얕은\n', '얕은')
    const plan = planMerge({ keep: deep, drop, docs: [deep, twin, drop, other], body: '본문\n' })
    expect(plan.edits).toEqual([{ rel: 'wiki/x.md', text: '[[b/new]] 참고\n', count: 1 }])
  })
})
