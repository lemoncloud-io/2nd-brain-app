import { describe, expect, it, vi } from 'vitest'
import { parseWikiPage } from '../../../../shared/wiki/parse'
import type { WikiReadResult } from '../../../../shared/ipc-contract'
import { withoutTitleHeading } from './use-wiki-read'
import { saveToggle } from './use-checkbox-toggle'

const FRONT = ['---', 'type: note', 'up:', '  - index', '---', ''].join('\n')

const NOTE = [FRONT, '# 2026-09-18', '', '## 할 일', '- [ ] 가', '- [ ] 나', '- [ ] 다'].join('\n')

const readOf = (text: string, hash: string): WikiReadResult => ({
  page: parseWikiPage('private/2026-09-18.md', text),
  text,
  hash
})

/** 리더는 frontmatter 와 제목 줄을 뺀 본문을 그린다 — 그 글 기준 줄 번호가 들어온다 */
const bodyLineOf = (text: string, needle: string): number => {
  const { page } = readOf(text, 'h')
  const body = withoutTitleHeading(page.body, page.title)
  return body.split('\n').findIndex((line) => line.includes(needle)) + 1
}

const apiOf = (
  write: (
    rel: string,
    text: string,
    baseHash: string
  ) => Promise<{ ok: true; hash: string } | { error: string }>,
  read: () => Promise<WikiReadResult | { error: string }> = () =>
    Promise.reject(new Error('다시 읽지 않아야 한다'))
): Parameters<typeof saveToggle>[0] => ({
  readWikiPage: vi.fn(read),
  writeWikiPage: vi.fn(write)
})

describe('saveToggle', () => {
  it('frontmatter 가 있는 문서에서 세 번째 체크박스를 누르면 원문의 그 줄만 바뀐다', async () => {
    let written = ''
    const api = apiOf((_rel, text, baseHash) => {
      written = text
      expect(baseHash).toBe('h1')
      return Promise.resolve({ ok: true as const, hash: 'h2' })
    })

    const result = await saveToggle(api, readOf(NOTE, 'h1'), bodyLineOf(NOTE, '- [ ] 다'))

    expect(result).toEqual({ ok: true })
    expect(written).toBe(NOTE.replace('- [ ] 다', '- [x] 다'))
  })

  it('다시 누르면 표식을 되돌린다', async () => {
    const text = NOTE.replace('- [ ] 가', '- [x] 가')
    let written = ''
    const api = apiOf((_rel, next) => {
      written = next
      return Promise.resolve({ ok: true as const, hash: 'h2' })
    })

    await saveToggle(api, readOf(text, 'h1'), bodyLineOf(text, '- [x] 가'))

    expect(written).toBe(NOTE)
  })

  // 줄 번호가 어긋났다는 뜻이다 — 엉뚱한 줄을 고치느니 한 번 실패한다
  it('줄이 체크박스 모양이 아니면 아무것도 쓰지 않는다', async () => {
    const api = apiOf(() => Promise.reject(new Error('쓰지 않아야 한다')))

    const result = await saveToggle(api, readOf(NOTE, 'h1'), bodyLineOf(NOTE, '## 할 일'))

    expect(result).toMatchObject({ error: expect.stringContaining('다시') })
    expect(api.writeWikiPage).not.toHaveBeenCalled()
  })

  it('해시가 어긋나면 다시 읽어 그 판 위에 쓴다 — 남의 변경을 덮지 않는다', async () => {
    const theirs = NOTE.replace('- [ ] 가', '- [x] 가')
    const api = apiOf(
      (_rel, _text, baseHash) =>
        Promise.resolve(
          baseHash === 'h2' ? { ok: true as const, hash: 'h2' } : { error: '그새 바뀌었다' }
        ),
      () => Promise.resolve(readOf(theirs, 'h2'))
    )

    const result = await saveToggle(api, readOf(NOTE, 'h1'), bodyLineOf(NOTE, '- [ ] 다'))

    expect(result).toEqual({ ok: true })
    expect(api.writeWikiPage).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.writeWikiPage).mock.calls[1][1]).toBe(
      theirs.replace('- [ ] 다', '- [x] 다')
    )
  })

  it('다시 읽은 판에서 그 줄이 체크박스가 아니면 두 번째 쓰기를 하지 않는다', async () => {
    const theirs = NOTE.replace('- [ ] 다', '메모로 바뀐 줄')
    const api = apiOf(
      () => Promise.resolve({ error: '그새 바뀌었다' }),
      () => Promise.resolve(readOf(theirs, 'h2'))
    )

    const result = await saveToggle(api, readOf(NOTE, 'h1'), bodyLineOf(NOTE, '- [ ] 다'))

    expect(result).toMatchObject({ error: expect.stringContaining('다시') })
    expect(api.writeWikiPage).toHaveBeenCalledTimes(1)
  })

  it('두 번째 쓰기도 거절되면 그 사유를 말한다', async () => {
    const api = apiOf(
      () => Promise.resolve({ error: '위키화가 도는 중이다' }),
      () => Promise.resolve(readOf(NOTE, 'h2'))
    )

    const result = await saveToggle(api, readOf(NOTE, 'h1'), bodyLineOf(NOTE, '- [ ] 나'))

    expect(result).toEqual({ error: '위키화가 도는 중이다' })
    expect(api.writeWikiPage).toHaveBeenCalledTimes(2)
  })

  it('다시 읽기가 실패하면 그 사유를 말한다', async () => {
    const api = apiOf(
      () => Promise.resolve({ error: '그새 바뀌었다' }),
      () => Promise.resolve({ error: '페이지를 읽을 수 없다' })
    )

    const result = await saveToggle(api, readOf(NOTE, 'h1'), bodyLineOf(NOTE, '- [ ] 나'))

    expect(result).toEqual({ error: '페이지를 읽을 수 없다' })
  })
  // 같은 줄 번호가 같은 항목이라는 보장은 없다 — 남이 위에 한 줄을 끼워 넣으면 한 칸씩 밀린다
  it('다시 읽은 판에서 그 줄의 글자가 달라졌으면 쓰지 않는다', async () => {
    const theirs = NOTE.replace('## 할 일', '## 할 일\n- [ ] 남이 끼워 넣은 항목')
    const api = apiOf(
      () => Promise.resolve({ error: '그새 바뀌었다' }),
      () => Promise.resolve(readOf(theirs, 'h2'))
    )

    const result = await saveToggle(api, readOf(NOTE, 'h1'), bodyLineOf(NOTE, '- [ ] 다'))

    expect(result).toMatchObject({ error: expect.stringContaining('다시') })
    expect(api.writeWikiPage).toHaveBeenCalledTimes(1)
  })
})
