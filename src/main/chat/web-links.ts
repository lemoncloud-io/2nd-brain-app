// 채팅 질문에 든 웹 주소를 앱이 먼저 읽어 싣는다 — 엔진의 웹 도구와 별개로, 질문에 쓴 주소는 엔진이 고르지 않아도 읽힌다
// (Codex 는 검색만 있다). GitHub PR·이슈 주소는 로그인 토큰으로 읽는 `github/link-context.ts` 몫이고, 여기는 로그인 없이
// 보이는 페이지만 읽는다.
import {
  fetchPage,
  htmlToText,
  isInsideAddress,
  PAGE_TYPES,
  type Page,
  type PageFailure
} from '../clip/web-page'
import type { GithubCall } from '../github/api'
import {
  githubLinksIn,
  readGithubLinks,
  type LinkContext,
  type LinkDoc
} from '../github/link-context'
import { mainT } from '../i18n'

export type PageFetch = (url: URL) => Promise<Page>

// 띄어쓰기 전까지 통째로 잡고, 한글이 주소인지 조사인지는 `withoutParticle` 이 가린다
const LINK = /https?:\/\/[^\s<>"'`]+/g
/** 주소 뒤에 띄어쓰기 없이 붙는 말 — "https://a.example/x를 봐줘" */
const PARTICLE =
  /^(을|를|이|가|은|는|에|의|도|와|과|로|으로|에서|랑|이랑|좀|이거|요|입니다|인데)+[.,!?]*$/

/** 한 질문에 읽는 웹 주소 수 — GitHub 주소와 따로 센다 */
const MAX_LINKS = 3
/** 주소 하나가 프롬프트에서 차지하는 글자 수 상한 — GitHub 주소와 같다 */
const PER_LINK = 12_000
/** 주소 하나에 쓰는 시간 — 답의 시작이 이만큼까지 늦어질 수 있다 */
const TIMEOUT_MS = 8_000
/** 페이지 크기 상한 — 프롬프트에 싣는 것은 12,000자뿐이라 자료 넣기(10MB)만큼 받을 이유가 없다 */
const MAX_BYTES = 1024 * 1024
// ui-hangul-ignore: AI 에게 보내는 본문 표식 — 화면 문구가 아니다
const CUT = '\n(본문 뒤가 잘렸다)'

/** 네트워크 오류 원문(detail)은 싣지 않는다. 문구는 알릴 때 그 언어로 읽는다 */
const failed = (failure: PageFailure): string => {
  const t = mainT().chatService.web
  switch (failure) {
    case 'silent':
    case 'unreachable':
      return t.offline
    case 'redirects':
      return t.redirects
    case 'too-big':
      return t.tooBig
    case 'timeout':
      return t.timeout(TIMEOUT_MS / 1000)
    case 'inside':
      return t.inside
  }
}

/** 이 앱이 채팅에서 웹 주소를 가져오는 방식 — 바깥 주소만, 작게, 짧게 */
export const fetchPublicPage: PageFetch = (url) =>
  fetchPage(url, {
    timeoutMs: TIMEOUT_MS,
    totalMs: TIMEOUT_MS,
    maxBytes: MAX_BYTES,
    refuse: isInsideAddress
  })

/** 문장 끝의 부호를 뗀다 — 닫는 괄호는 짝이 없을 때만(위키백과 `Foo_(bar)`) */
const trimmed = (raw: string): string => {
  let url = raw
  for (;;) {
    const last = url.at(-1) ?? ''
    const unpaired = last === ')' && url.split('(').length <= url.split(')').length - 1
    if (!/[.,;:!?'"\]]/.test(last) && !unpaired) return url
    url = url.slice(0, -1)
  }
}

/**
 * 주소에 붙은 한글을 가린다 — 경로·질의의 구분자(`/`·`=`·`_`…) 바로 뒤에서 시작하고 조사가 아니면 주소의 일부
 * (`…/wiki/깃허브`), 그 밖은 주소 뒤에 붙여 쓴 말이다(`…/post이거`). 주소의 한글 뒤에 조사까지 붙여 쓴 것은 못 가른다
 */
const withoutParticle = (raw: string): string => {
  const at = raw.search(/[^\x21-\x7e]/)
  if (at === -1) return raw
  const part = /[/=_\-?&#.%:]/.test(raw[at - 1] ?? '') && !PARTICLE.test(raw.slice(at))
  return part ? raw : raw.slice(0, at)
}

/** 글에 든 웹 주소 — 같은 것은 한 번만(`#…` 만 다른 것도 같은 페이지다), GitHub 쪽이 읽는 PR·이슈 주소는 뺀다 */
export const webLinksIn = (text: string): URL[] => {
  const found = new Map<string, URL>()
  for (const [raw] of text.matchAll(LINK)) {
    const candidate = trimmed(withoutParticle(raw))
    if (githubLinksIn(candidate).length > 0 || !URL.canParse(candidate)) continue
    const url = new URL(candidate)
    const page = url.href.slice(0, url.href.length - url.hash.length)
    if (url.hostname !== '' && !found.has(page)) found.set(page, url)
  }
  return [...found.values()]
}

type Read = { doc: LinkDoc | null; notice: string | null }

const readOne = async (fetch: PageFetch, url: URL): Promise<Read> => {
  const page = await fetch(url)
  if ('failed' in page) return { doc: null, notice: failed(page.failed) }
  if (page.status !== 200)
    return { doc: null, notice: mainT().chatService.web.refused(page.status) }
  if (!PAGE_TYPES.includes(page.type)) return { doc: null, notice: mainT().chatService.web.notText }
  const raw = page.body.toString('utf8')
  const { title, text } = page.type === 'text/html' ? htmlToText(raw) : { title: '', text: raw }
  const body = text.trim()
  // 스크립트가 그리는 페이지는 받아 온 HTML 에 글이 없다
  if (body === '') return { doc: null, notice: mainT().chatService.web.noText }
  // ui-hangul-ignore: AI 에게 보내는 본문 머리 — 화면 문구가 아니다
  const head = `웹 페이지: ${url.host}\n${title === '' ? '' : `제목: ${title}\n`}\n본문:\n`
  const full = head + body
  if (full.length <= PER_LINK)
    return { doc: { url: url.href, text: full, truncated: false }, notice: null }
  return {
    // 짝 글자(이모지)의 앞 반쪽에서 끊지 않는다
    doc: {
      url: url.href,
      text: full.slice(0, PER_LINK - CUT.length).replace(/[\uD800-\uDBFF]$/, '') + CUT,
      truncated: true
    },
    notice: null
  }
}

/** 질문에 든 웹 주소를 읽는다. 못 읽은 것은 notices 로 — 던지지 않는다 */
export const readWebLinks = async (fetch: PageFetch, question: string): Promise<LinkContext> => {
  const links = webLinksIn(question)
  const read = await Promise.all(
    links.slice(0, MAX_LINKS).map((url) =>
      readOne(fetch, url).catch((err: unknown): Read => {
        console.error('chat web link failed', url.host, err)
        return { doc: null, notice: mainT().githubMain.linksUnread }
      })
    )
  )
  const notices = new Set(read.map((one) => one.notice).filter((notice) => notice !== null))
  if (links.length > MAX_LINKS) notices.add(mainT().chatService.web.tooMany(MAX_LINKS))
  return {
    docs: read.map((one) => one.doc).filter((doc) => doc !== null),
    notices: [...notices]
  }
}

/** 질문에 든 주소 전부 — GitHub PR·이슈는 로그인 토큰으로, 그 밖은 웹 페이지로 읽는다. 토큰은 GitHub API 로만 간다 */
export const readLinks = async (
  deps: { github: GithubCall; page: PageFetch },
  question: string
): Promise<LinkContext> => {
  const [github, web] = await Promise.all([
    readGithubLinks(deps.github, question),
    readWebLinks(deps.page, question)
  ])
  return { docs: [...github.docs, ...web.docs], notices: [...github.notices, ...web.notices] }
}
