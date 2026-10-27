import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { fetchPage, htmlToText, isInsideAddress } from './web-page'

let server: Server | null = null

const serve = (handler: Parameters<typeof createServer>[1]): Promise<number> =>
  new Promise((ready) => {
    server = createServer(handler)
    server.listen(0, '127.0.0.1', () => ready((server?.address() as AddressInfo).port))
  })

afterEach(() => {
  server?.closeAllConnections()
  server?.close()
  server = null
})

const LIMITS = { timeoutMs: 2_000, maxBytes: 1024 }

describe('isInsideAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    // URL 이 돌려주는 꼴 — new URL('http://[::ffff:127.0.0.1]/').hostname
    '::ffff:7f00:1',
    '::7f00:1',
    '64:ff9b::7f00:1',
    '2002:7f00:1::',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255'
  ])('%s 는 안쪽 주소다', (address) => {
    expect(isInsideAddress(address)).toBe(true)
  })

  it.each(['8.8.8.8', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', 'example.com'])(
    '%s 는 안쪽 주소가 아니다',
    (address) => {
      expect(isInsideAddress(address)).toBe(false)
    }
  )
})

describe('fetchPage', () => {
  it('응답의 상태·형식·본문을 준다', async () => {
    const port = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('안녕')
    })
    const page = await fetchPage(new URL(`http://127.0.0.1:${port}/`), LIMITS)
    expect(page).toEqual({ status: 200, type: 'text/plain', body: Buffer.from('안녕') })
  })

  it('가려 받으면 IP 로 적은 안쪽 주소에 연결하지 않는다', async () => {
    let hits = 0
    const port = await serve((_req, res) => {
      hits += 1
      res.end('secret')
    })
    const limits = { ...LIMITS, refuse: isInsideAddress }
    expect(await fetchPage(new URL(`http://127.0.0.1:${port}/`), limits)).toEqual({
      failed: 'inside'
    })
    expect(await fetchPage(new URL(`http://[::1]:${port}/`), limits)).toEqual({ failed: 'inside' })
    expect(hits).toBe(0)
  })

  it('가려 받으면 이름이 안쪽 주소를 가리켜도 연결하지 않는다', async () => {
    let hits = 0
    const port = await serve((_req, res) => {
      hits += 1
      res.end('secret')
    })
    const page = await fetchPage(new URL(`http://localhost:${port}/`), {
      ...LIMITS,
      refuse: isInsideAddress
    })
    expect(page).toEqual({ failed: 'inside' })
    expect(hits).toBe(0)
  })

  it('가려 받으면 넘어간 곳이 안쪽 주소일 때 따라가지 않는다', async () => {
    let hits = 0
    const port = await serve((req, res) => {
      if (req.url === '/secret') {
        hits += 1
        return void res.end('secret')
      }
      res.writeHead(302, { location: `http://[::1]:${port}/secret` })
      res.end()
    })
    // 첫 주소(127.0.0.1)는 지나가게 두고 넘어간 주소(::1)만 막는다
    const page = await fetchPage(new URL(`http://127.0.0.1:${port}/`), {
      ...LIMITS,
      refuse: (address) => address === '::1'
    })
    expect(page).toEqual({ failed: 'inside' })
    expect(hits).toBe(0)
  })

  it('가려 받으면 앞선 요청이 열어 둔 연결을 다시 쓰지 않는다', async () => {
    let hits = 0
    const port = await serve((_req, res) => {
      hits += 1
      res.end('secret')
    })
    const url = new URL(`http://localhost:${port}/`)
    // 가리지 않는 요청(자료 넣기)이 같은 곳에 연결을 열어 둔다
    expect(await fetchPage(url, LIMITS)).toMatchObject({ status: 200 })
    expect(await fetchPage(url, { ...LIMITS, refuse: isInsideAddress })).toEqual({
      failed: 'inside'
    })
    expect(hits).toBe(1)
  })

  it('넘기는 응답의 본문은 받지 않고 끊는다', async () => {
    let closed = false
    const port = await serve((req, res) => {
      if (req.url === '/end') return void res.end('끝')
      res.writeHead(302, { location: '/end' })
      const flood = setInterval(() => res.write('x'.repeat(65536)), 5)
      res.on('close', () => {
        clearInterval(flood)
        closed = true
      })
    })
    const page = await fetchPage(new URL(`http://127.0.0.1:${port}/`), LIMITS)
    expect(page).toMatchObject({ status: 200 })
    await new Promise((wait) => setTimeout(wait, 100))
    expect(closed).toBe(true)
  })

  it('http(s) 밖으로 넘기는 응답은 따라가지 않는다', async () => {
    const port = await serve((_req, res) => {
      res.writeHead(302, { location: 'file:///etc/passwd' })
      res.end()
    })
    const page = await fetchPage(new URL(`http://127.0.0.1:${port}/`), LIMITS)
    expect(page).toMatchObject({ failed: 'unreachable' })
  })

  it('상한보다 큰 응답은 끊는다', async () => {
    const port = await serve((_req, res) => {
      res.end('x'.repeat(4096))
    })
    expect(await fetchPage(new URL(`http://127.0.0.1:${port}/`), LIMITS)).toEqual({
      failed: 'too-big'
    })
  })

  it('totalMs 를 넘기면 조금씩 오는 응답도 끊는다', async () => {
    const port = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      const drip = setInterval(() => res.write('.'), 20)
      res.on('close', () => clearInterval(drip))
    })
    const page = await fetchPage(new URL(`http://127.0.0.1:${port}/`), { ...LIMITS, totalMs: 150 })
    expect(page).toEqual({ failed: 'timeout' })
  })
})

describe('htmlToText', () => {
  it('본문의 글만 문단 경계를 살려 준다 — 태그·스크립트·스타일·메뉴·바닥글은 버린다', () => {
    const page = htmlToText(
      `<html><head><title>글 &amp; 제목</title><style>p{color:red}</style></head><body><nav><a>메뉴</a></nav><ARTICLE><h1>글 제목</h1><p>첫 문단이다. <a href="/x">링크 글</a> 이어진다.</p><p>둘째&nbsp;문단 &#44032; &lt;b&gt;</p><script>track()</script><!-- 주석 --></ARTICLE><svg><title>아이콘</title></svg><footer>바닥</footer></body></html>`
    )
    expect(page.title).toBe('글 & 제목')
    expect(page.text).toBe('글 제목\n\n첫 문단이다. 링크 글 이어진다.\n\n둘째 문단 가 <b>')
  })

  it('article·main 이 없으면 body 에서 메뉴·바닥글을 뺀 글 — 글이 없으면 빈 글', () => {
    expect(
      htmlToText(
        '<html><body><nav>메뉴</nav><table><tr><td>가</td><td>나</td></tr></table><footer>바닥</footer></body></html>'
      ).text
    ).toBe('가 나')
    expect(
      htmlToText('<html><body><div id="app"></div><script>render()</script></body></html>').text
    ).toBe('')
  })

  it('닫히지 않은 태그·주석, 태그가 아닌 < 에서 멈추지 않는다', () => {
    expect(htmlToText('<body><p>1 < 2 이다<script>끝없는').text).toBe('1 < 2 이다')
    expect(htmlToText('<body>앞<!-- 끝없는 주석').text).toBe('앞')
  })

  it('크고 나쁜 페이지도 금방 끝난다', () => {
    const fill = (unit: string): string => unit.repeat(Math.floor((1024 * 1024) / unit.length))
    const started = Date.now()
    for (const html of [
      fill('<a href="/x">a</a> '),
      fill('<div class="c"><i></i></div>'),
      `${'<div>'.repeat(20000)}x${fill('<span>y</span>')}`,
      fill('<script>'),
      fill('<'),
      fill('&amp;')
    ]) {
      htmlToText(`<html><body>${html}</body></html>`)
    }
    expect(Date.now() - started).toBeLessThan(3_000)
  })
})
