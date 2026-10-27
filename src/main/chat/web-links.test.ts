import { afterEach, describe, expect, it } from 'vitest'
import type { Page } from '../clip/web-page'
import { setMainLanguage } from '../i18n'
import { readLinks, readWebLinks, webLinksIn, type PageFetch } from './web-links'

afterEach(() => setMainLanguage('ko'))

const html = (title: string, body: string): Page => ({
  status: 200,
  type: 'text/html',
  body: Buffer.from(
    `<html><head><title>${title}</title></head><body><article><h1>${title}</h1>${body}</article></body></html>`
  )
})

const paragraphs = (text: string, times: number): string => `<p>${text}</p>`.repeat(times)

/** 주소별 응답을 정해 둔 가짜 — 부른 주소를 남긴다 */
const fake = (pages: Record<string, Page>): { fetch: PageFetch; calls: string[] } => {
  const calls: string[] = []
  return {
    calls,
    fetch: async (url) => {
      calls.push(url.href)
      return pages[url.href] ?? { failed: 'unreachable', detail: 'ENOTFOUND' }
    }
  }
}

describe('webLinksIn', () => {
  it('글에 든 http(s) 주소를 뽑는다 — 같은 것은 한 번만', () => {
    const links = webLinksIn(
      'https://example.com/a 랑 http://example.org/b?x=1#y 보고 https://example.com/a 다시'
    )
    expect(links.map((link) => link.href)).toEqual([
      'https://example.com/a',
      'http://example.org/b?x=1#y'
    ])
  })

  it('주소 뒤에 붙은 문장 부호와 한글은 주소가 아니다', () => {
    expect(
      webLinksIn('(https://example.com/a). 그리고 https://example.com/b이거').map(String)
    ).toEqual(['https://example.com/a', 'https://example.com/b'])
  })

  it('경로에 든 한글은 주소의 일부다 — 구분자 뒤에서 시작하고 조사가 아닐 때', () => {
    expect(
      webLinksIn('https://ko.wikipedia.org/wiki/깃허브 읽어줘').map((url) => url.pathname)
    ).toEqual(['/wiki/%EA%B9%83%ED%97%88%EB%B8%8C'])
    expect(
      webLinksIn('https://example.com/를 봐줘 https://example.org/a/는요?').map(String)
    ).toEqual(['https://example.com/', 'https://example.org/a/'])
  })

  it('`#…` 만 다른 주소는 같은 페이지다', () => {
    expect(webLinksIn('https://example.com/a#one https://example.com/a#two')).toHaveLength(1)
  })

  it('짝이 맞는 괄호는 주소의 일부다', () => {
    expect(webLinksIn('https://en.wikipedia.org/wiki/Foo_(bar)').map(String)).toEqual([
      'https://en.wikipedia.org/wiki/Foo_(bar)'
    ])
  })

  it('GitHub PR·이슈 주소는 GitHub 쪽이 읽으므로 뺀다 — 그 밖의 github.com 주소는 웹 주소다', () => {
    const links = webLinksIn(
      'https://github.com/acme/app/pull/12/files https://github.com/acme/app/issues/3 https://github.com/acme/app'
    )
    expect(links.map(String)).toEqual(['https://github.com/acme/app'])
  })

  it('http(s) 가 아닌 주소는 읽지 않는다', () => {
    expect(webLinksIn('file:///etc/passwd ftp://example.com/x')).toEqual([])
  })
})

describe('readWebLinks', () => {
  it('주소가 없으면 아무것도 부르지 않는다', async () => {
    const web = fake({})
    expect(await readWebLinks(web.fetch, '주소 없는 질문')).toEqual({ docs: [], notices: [] })
    expect(web.calls).toEqual([])
  })

  it('웹 페이지의 제목과 본문을 글로 싣는다', async () => {
    const web = fake({
      'https://example.com/post': html('카메라 롤 정리', paragraphs('사진을 날짜로 묶는다.', 6))
    })
    const read = await readWebLinks(web.fetch, 'https://example.com/post 이거 어때')
    expect(read.notices).toEqual([])
    expect(read.docs).toHaveLength(1)
    expect(read.docs[0]?.url).toBe('https://example.com/post')
    expect(read.docs[0]?.text).toContain('제목: 카메라 롤 정리')
    expect(read.docs[0]?.text).toContain('사진을 날짜로 묶는다.')
    expect(read.docs[0]?.text).not.toContain('<p>')
    expect(read.docs[0]?.truncated).toBe(false)
  })

  it('markdown·글 응답은 그대로 싣는다', async () => {
    const web = fake({
      'https://example.com/readme.md': {
        status: 200,
        type: 'text/markdown',
        body: Buffer.from('# 읽어 보기\n\n본문 한 줄')
      }
    })
    const read = await readWebLinks(web.fetch, 'https://example.com/readme.md')
    expect(read.docs[0]?.text).toContain('# 읽어 보기\n\n본문 한 줄')
  })

  it('긴 본문은 예산 안에서 자르고 잘렸다고 적는다', async () => {
    const web = fake({
      'https://example.com/long': html(
        '긴 글',
        paragraphs('가나다라마바사아자차카타파하 '.repeat(20), 200)
      )
    })
    const read = await readWebLinks(web.fetch, 'https://example.com/long')
    expect(read.docs[0]?.truncated).toBe(true)
    expect(read.docs[0]?.text.length).toBeLessThanOrEqual(12_000)
    expect(read.docs[0]?.text).toContain('(본문 뒤가 잘렸다)')
  })

  it('한 번에 3개까지만 읽고 나머지는 알린다', async () => {
    const web = fake({})
    const read = await readWebLinks(
      web.fetch,
      'https://a.example/1 https://a.example/2 https://a.example/3 https://a.example/4'
    )
    expect(web.calls).toHaveLength(3)
    expect(read.notices.some((notice) => notice.includes('3개까지'))).toBe(true)
  })

  it('알림은 알리는 때의 화면 언어로 쓴다 — 모듈에 굳혀 두지 않는다', async () => {
    setMainLanguage('en')
    const read = await readWebLinks(fake({}).fetch, 'https://a.example/1')
    expect(read.notices).toEqual([
      "Couldn't connect to the web address — check the address and your internet connection"
    ])
  })

  it.each([
    [{ status: 403, type: 'text/html', body: Buffer.from('') }, 'HTTP 403'],
    [{ status: 200, type: 'application/pdf', body: Buffer.from('%PDF') }, '웹 페이지나 글이 아닌'],
    [{ failed: 'inside' }, '안쪽 주소'],
    [{ failed: 'timeout' }, '응답하지 않아'],
    [{ failed: 'too-big' }, '너무 커서'],
    [{ failed: 'unreachable', detail: 'ECONNRESET at 10.0.0.1' }, '연결하지 못했어요'],
    [
      {
        status: 200,
        type: 'text/html',
        body: Buffer.from('<html><body><div id="app"></div><script>render()</script></body></html>')
      },
      '읽을 글을 찾지 못했어요'
    ]
  ] as [Page, string][])('못 읽은 이유를 사람 말로 알린다 — %#', async (page, expected) => {
    const web = fake({ 'https://example.com/x': page })
    const read = await readWebLinks(web.fetch, 'https://example.com/x')
    expect(read.docs).toEqual([])
    expect(read.notices).toHaveLength(1)
    expect(read.notices[0]).toContain(expected)
    // 네트워크 오류 원문은 화면에 내지 않는다
    expect(read.notices[0]).not.toContain('ECONNRESET')
  })

  it('같은 이유는 한 번만 알린다', async () => {
    const web = fake({})
    const read = await readWebLinks(web.fetch, 'https://a.example/1 https://a.example/2')
    expect(read.notices).toHaveLength(1)
  })

  it('가져오기가 던져도 다른 주소는 읽는다', async () => {
    const good = html('남은 글', paragraphs('읽힌다.', 6))
    const fetch: PageFetch = async (url) => {
      if (url.pathname === '/boom') throw new Error('boom')
      return good
    }
    const read = await readWebLinks(fetch, 'https://example.com/boom https://example.com/ok')
    expect(read.docs.map((doc) => doc.url)).toEqual(['https://example.com/ok'])
    expect(read.notices).toHaveLength(1)
  })
})

describe('readLinks', () => {
  it('GitHub 주소와 웹 주소를 각자의 길로 읽어 합친다', async () => {
    const web = fake({ 'https://example.com/post': html('웹 글', paragraphs('웹 본문.', 6)) })
    const github: string[] = []
    const read = await readLinks(
      {
        github: {
          token: 'tok',
          fetch: async (input) => {
            github.push(String(input))
            return new Response(
              JSON.stringify({
                title: '이슈 제목',
                state: 'open',
                user: { login: 'kim' },
                body: '이슈 본문'
              }),
              { status: 200 }
            )
          }
        },
        page: web.fetch
      },
      'https://github.com/acme/app/issues/3 랑 https://example.com/post'
    )
    expect(github).toHaveLength(1)
    expect(web.calls).toEqual(['https://example.com/post'])
    expect(read.docs.map((doc) => doc.url)).toEqual([
      'https://github.com/acme/app/issues/3',
      'https://example.com/post'
    ])
  })
})
