// 웹 주소 하나를 가져와 글로 바꾼다 — 자료 넣기(`clip-service.ts`)와 채팅의 주소 읽기(`chat/web-links.ts`)가 같이 쓴다.
import { lookup } from 'node:dns'
import { request as httpRequest } from 'node:http'
import { request } from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import TurndownService from 'turndown'

/** 글로 읽을 수 있는 응답 형식 */
export const PAGE_TYPES = ['text/html', 'text/markdown', 'text/plain']
const MAX_REDIRECTS = 5
// 이름 없는 요청을 거절하는 곳이 있다 — 2026-10-14 실측: 헤더 없이는 ko.wikipedia.org 가 403
const USER_AGENT = '2nd-brain (desktop app; reads a page its user linked)'

export type PageLimits = {
  /** 응답이 이만큼 조용하면 끊는다 */
  timeoutMs: number
  maxBytes: number
  /** 넘어가기까지 합친 전체 시간 — 없으면 조용한 시간만 본다 */
  totalMs?: number
  /**
   * 가지 않을 주소(IP 글자) — 주면 IP 로 적은 주소·DNS 가 가리킨 주소·실제로 붙은 주소를 넘어간 곳마다 본다.
   * 바깥 주소만 읽으려면 `isInsideAddress`
   */
  refuse?: (address: string) => boolean
}

export type PageFailure = 'silent' | 'redirects' | 'too-big' | 'timeout' | 'inside' | 'unreachable'

/** detail = 네트워크 오류 원문(ENOTFOUND 등) — unreachable 일 때만 */
export type Page =
  { status: number; type: string; body: Buffer } | { failed: PageFailure; detail?: string }

const INSIDE = new BlockList()
for (const [prefix, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
] as const) {
  INSIDE.addSubnet(prefix, bits, 'ipv4')
}
// IPv4 를 품은 IPv6(::/96·NAT64·6to4)는 안에 든 IPv4 를 따로 풀지 않고 통째로 막는다
for (const [prefix, bits] of [
  ['::', 96],
  ['64:ff9b::', 96],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8]
] as const) {
  INSIDE.addSubnet(prefix, bits, 'ipv6')
}

/** IP 글자가 이 컴퓨터·사내망·링크 로컬을 가리키나 — IP 가 아니면 false(이름은 DNS 를 거친 뒤에 본다) */
export const isInsideAddress = (address: string): boolean => {
  const family = isIP(address)
  if (family === 0) return false
  // IPv4 를 IPv6 로 감싼 것(::ffff:127.0.0.1)은 안쪽 IPv4 로 본다
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1]
  if (mapped !== undefined) return INSIDE.check(mapped, 'ipv4')
  return INSIDE.check(address, family === 6 ? 'ipv6' : 'ipv4')
}

class Refused extends Error {}

// 이름을 푼 주소를 연결 직전에 본다 — 미리 따로 풀어 보면 그 사이 DNS 답이 바뀔 수 있다
const guardedLookup =
  (refuse: (address: string) => boolean): LookupFunction =>
  (hostname, options, callback) => {
    lookup(hostname, options, (err, address, family) => {
      if (err !== null) return callback(err, address, family)
      const found = typeof address === 'string' ? [address] : address.map((one) => one.address)
      if (found.some(refuse)) return callback(new Refused(hostname), address, family)
      callback(null, address, family)
    })
  }

const hop = (
  url: URL,
  limits: PageLimits,
  redirects: number,
  until: number | null
): Promise<Page> =>
  new Promise((done) => {
    const { refuse } = limits
    if (refuse?.(url.hostname.replace(/^\[|\]$/g, '')) === true) return done({ failed: 'inside' })
    let timer: NodeJS.Timeout | undefined
    const finish = (page: Page): void => {
      clearTimeout(timer)
      done(page)
    }
    const get = url.protocol === 'https:' ? request : httpRequest
    const req = get(
      url,
      {
        timeout: limits.timeoutMs,
        headers: { 'user-agent': USER_AGENT },
        // 가려 받을 때는 연결을 새로 연다 — 열려 있던 연결(keep-alive)을 다시 쓰면 lookup 이 돌지 않는다
        ...(refuse === undefined ? {} : { lookup: guardedLookup(refuse), agent: false })
      },
      (res) => {
        // 실제로 붙은 주소를 한 번 더 본다 — lookup 을 거치지 않는 길이 생겨도 여기서 걸린다
        if (refuse?.(res.socket.remoteAddress ?? '') === true) {
          req.destroy()
          return finish({ failed: 'inside' })
        }
        if (res.statusCode === undefined) return finish({ failed: 'silent' })
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          // 넘기는 응답의 본문은 받지 않고 끊는다 — 흘려 두면 크기·시간 상한 밖에서 계속 받는다
          req.destroy()
          if (redirects >= MAX_REDIRECTS) return finish({ failed: 'redirects' })
          let next: URL
          try {
            next = new URL(res.headers.location, url)
          } catch {
            return finish({ failed: 'unreachable', detail: 'bad redirect' })
          }
          // http(s) 밖으로 넘기는 응답은 따라가지 않는다 — request() 가 던진다
          if (next.protocol !== 'http:' && next.protocol !== 'https:') {
            return finish({ failed: 'unreachable', detail: 'bad redirect' })
          }
          clearTimeout(timer)
          return void hop(next, limits, redirects + 1, until).then(done)
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > limits.maxBytes) {
            req.destroy()
            finish({ failed: 'too-big' })
          } else {
            chunks.push(chunk)
          }
        })
        res.on('end', () => {
          if (res.statusCode === undefined) return finish({ failed: 'silent' })
          finish({
            status: res.statusCode,
            type: String(res.headers['content-type'] ?? '')
              .split(';')[0]
              .trim(),
            body: Buffer.concat(chunks)
          })
        })
        res.on('error', (err: Error) => finish({ failed: 'unreachable', detail: err.message }))
      }
    )
    if (until !== null) {
      timer = setTimeout(
        () => {
          req.destroy()
          done({ failed: 'timeout' })
        },
        Math.max(0, until - Date.now())
      )
    }
    req.on('timeout', () => {
      req.destroy()
      finish({ failed: 'timeout' })
    })
    req.on('error', (err: Error) =>
      finish(
        err instanceof Refused
          ? { failed: 'inside' }
          : { failed: 'unreachable', detail: err.message }
      )
    )
    req.end()
  })

/** http(s) 주소 하나를 가져온다 — 넘어가는 주소는 5번까지 따라간다. 던지지 않는다 */
export const fetchPage = (url: URL, limits: PageLimits): Promise<Page> =>
  hop(url, limits, 0, limits.totalMs === undefined ? null : Date.now() + limits.totalMs)

export const htmlToMarkdown = (html: string, baseUrl: string): { title: string; md: string } => {
  const dom = new JSDOM(html, { url: baseUrl })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()
  const title = article?.title ?? new JSDOM(html).window.document.title ?? 'clipping'
  const turndown = new TurndownService({ headingStyle: 'atx' })
  const md = turndown.turndown(article?.content ?? html)
  return { title, md }
}

const BLOCKS = new Set(
  'p div li ul ol h1 h2 h3 h4 h5 h6 tr table br hr pre blockquote section article main header dt dd figcaption'.split(
    ' '
  )
)
const CELLS = new Set(['td', 'th'])
/** 안의 글을 통째로 건너뛰는 요소 — 코드와, 본문이 아닌 둘레(메뉴·바닥글) */
const UNREAD = new Set(['script', 'style', 'noscript', 'template', 'svg', 'nav', 'aside', 'footer'])
const TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)/y
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
}

const decoded = (text: string): string =>
  text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== '#') return NAMED[name.toLowerCase()] ?? whole
    const code =
      name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  })

/** html[from, to) 의 글 — 한 번 훑는다(찾는 자리는 뒤로 가지 않는다) */
const scan = (html: string, lower: string, from: number, to: number): string => {
  const out: string[] = []
  let at = from
  while (at < to) {
    const open = html.indexOf('<', at)
    if (open === -1 || open >= to) {
      out.push(html.slice(at, to))
      break
    }
    out.push(html.slice(at, open))
    if (html.startsWith('<!--', open)) {
      const end = html.indexOf('-->', open + 4)
      at = end === -1 ? to : end + 3
      continue
    }
    TAG.lastIndex = open
    const name = TAG.exec(html)?.[1]?.toLowerCase()
    const close = html.indexOf('>', open)
    if (name === undefined || close === -1) {
      // 태그가 아닌 `<` — 글자다
      out.push('<')
      at = open + 1
      continue
    }
    at = close + 1
    if (UNREAD.has(name) && html[open + 1] !== '/') {
      const end = lower.indexOf(`</${name}`, at)
      at = end === -1 ? to : end
    } else if (BLOCKS.has(name)) out.push('\n')
    else if (CELLS.has(name)) out.push(' ')
  }
  return decoded(out.join(''))
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * HTML → 제목과 본문 글(서식 없음). `htmlToMarkdown` 과 달리 DOM 을 만들지 않고 글자를 한 번 훑는다 — JSDOM·Readability·
 * turndown 은 512KB 페이지 하나로 main 을 40초 넘게 세울 수 있다(2026-10-14 실측: 링크만 가득한 페이지, 빈 div 만 가득한 페이지).
 * 답을 기다리는 채팅이 쓴다. 본문은 `<article>`·`<main>` 이 있으면 그 안, 없으면 `<body>` 에서 메뉴·바닥글을 뺀 것
 */
export const htmlToText = (html: string): { title: string; text: string } => {
  const lower = html.toLowerCase()
  const inside = (name: string): [number, number] | null => {
    const open = lower.indexOf(`<${name}`)
    const close = lower.lastIndexOf(`</${name}`)
    return open === -1 || close <= open ? null : [open, close]
  }
  // 제목은 첫 `<title>` 하나다 — 뒤쪽 SVG 의 `<title>` 까지 잡으면 페이지 전체가 제목이 된다
  const titleOpen = lower.indexOf('<title')
  const titleClose = titleOpen === -1 ? -1 : lower.indexOf('</title', titleOpen)
  const title: [number, number] | null = titleClose === -1 ? null : [titleOpen, titleClose]
  const [from, to] = inside('article') ?? inside('main') ?? inside('body') ?? [0, html.length]
  return {
    title: title === null ? '' : scan(html, lower, title[0], title[1]).replace(/\n/g, ' '),
    text: scan(html, lower, from, to)
  }
}
