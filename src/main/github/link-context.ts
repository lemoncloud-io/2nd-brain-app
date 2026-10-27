// 채팅 질문에 든 GitHub PR·이슈 주소를 앱이 대신 읽는다 — 엔진의 웹 도구는 로그인이 없어 비공개 저장소를 못 읽고, 토큰은 main 을 떠나지 않는다.
// 읽어 온 글은 프롬프트의 자료 블록이 된다(`chat/prompts.ts`).
import { githubRequest, type GithubCall } from './api'
import { field } from './repos'
import { mainT } from '../i18n'

export type GithubLink = {
  owner: string
  repo: string
  kind: 'pull' | 'issue'
  number: number
  url: string
}

/** 주소 하나에서 읽어 온 글 — text 는 예산 안에서 자른 것 */
export type LinkDoc = { url: string; text: string; truncated: boolean }

/** notices = 못 읽은 이유와 할 일, 사람 말 — 같은 말은 한 번만 */
export type LinkContext = { docs: LinkDoc[]; notices: string[] }

// 호스트는 글자 그대로 `https://github.com/` 만 맞는다. 번호 뒤는 보지 않되(/files·#…) 숫자가 이어지면 다른 번호다
const LINK =
  /https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/(pull|issues)\/(\d{1,9})(?!\d)/g

/** 한 질문에 읽는 주소 수 */
const MAX_LINKS = 3
/** 주소 하나가 프롬프트에서 차지하는 글자 수 상한 — 붙인 문서(`attach.ts` PER_DOC)의 절반 */
const PER_LINK = 12_000
/** 요청 하나의 시간 제한 — 답의 시작이 이만큼까지 늦어질 수 있다 */
const TIMEOUT_MS = 8_000

/** 본문을 자른 자리에 남기는 표시 — 뒤의 파일 목록은 온전하다는 것을 엔진이 알게 */
// ui-hangul-ignore: AI 에게 보내는 자름 표시(범위 밖: AI 프롬프트)
const CUT = '\n(본문 뒤가 잘렸다)'
/** 파일 목록이 가져가는 몫 — 나머지는 머리와 본문 자리다 */
const TAIL_ROOM = PER_LINK / 2
// ui-hangul-ignore: AI 에게 보내는 자름 표시(범위 밖: AI 프롬프트)
const FILES_CUT = '(파일 목록 뒤가 잘렸다)'
// ui-hangul-ignore: AI 에게 보내는 표시(범위 밖: AI 프롬프트)
const FILES_MISSING = '(변경 파일 목록을 읽지 못했다)'

/** 글에 든 GitHub PR·이슈 주소 — 같은 것은 한 번만 */
export const githubLinksIn = (text: string): GithubLink[] => {
  const found = new Map<string, GithubLink>()
  for (const [, owner, repo, kind, number] of text.matchAll(LINK)) {
    // `.`·`..` 은 저장소 이름이 아니라 경로 조각이다 — API 주소가 다른 곳을 가리키게 된다
    if (owner === undefined || repo === undefined || repo === '.' || repo === '..') continue
    const url = `https://github.com/${owner}/${repo}/${kind}/${number}`
    if (found.has(url)) continue
    found.set(url, {
      owner,
      repo,
      kind: kind === 'pull' ? 'pull' : 'issue',
      number: Number(number),
      url
    })
  }
  return [...found.values()]
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const count = (value: unknown): number => (typeof value === 'number' ? value : 0)

type Got = { ok: true; body: unknown } | { ok: false; reason: string }

/** GitHub 응답 → 사용자가 할 일. 응답 원문은 싣지 않는다 */
const failure = (status: number, body: unknown): string => {
  const message = text(field(body, 'message'))
  if (status === 401) return mainT().githubMain.linkLoginAgain
  if (status === 403 && /saml|sso/i.test(message)) return mainT().githubMain.linkOrgBlocked
  // 요청 한도 초과도 403 이다 — 주소·계정 탓이 아니다
  if (status === 429 || (status === 403 && /rate limit/i.test(message)))
    return mainT().githubMain.linkBusy
  // 볼 수 없는 비공개 저장소도 GitHub 는 404 로 답한다
  if (status === 403 || status === 404) return mainT().githubMain.linkNotVisible
  return mainT().githubMain.linkFailed(status)
}

const get = async (deps: GithubCall, path: string): Promise<Got> => {
  const reply = await githubRequest(deps, path, { timeoutMs: TIMEOUT_MS })
  if (!reply.ok)
    return {
      ok: false,
      reason:
        reply.unreached === 'login' ? mainT().githubMain.linkNeedLogin : mainT().githubMain.offline
    }
  if (reply.status < 200 || reply.status >= 300) {
    return { ok: false, reason: failure(reply.status, reply.body) }
  }
  return { ok: true, body: reply.body }
}

/** 꼬리(파일 목록)를 제 몫 안에 — 줄 단위로 자르고 잘렸다고 적는다. 본문 자리를 다 가져가지 않는다 */
const fitTail = (lines: string[]): { lines: string[]; cut: boolean } => {
  const kept: string[] = []
  let used = 0
  for (const line of lines) {
    used += line.length + 1
    if (used > TAIL_ROOM) return { lines: [...kept, FILES_CUT], cut: true }
    kept.push(line)
  }
  return { lines: kept, cut: false }
}

/** 머리·본문·꼬리를 예산 안에 — 넘치면 본문을 자른다(꼬리의 파일 목록이 본문에 밀려 사라지지 않게) */
// ui-hangul-ignore: AI 에게 보내는 주소 내용 머리(범위 밖: AI 프롬프트)
const fit = (url: string, head: string[], body: string, tail: string[]): LinkDoc => {
  const fitted = fitTail(tail)
  const before = `${head.join('\n')}\n\n본문:\n`
  const after = fitted.lines.length === 0 ? '' : `\n\n${fitted.lines.join('\n')}`
  const full = before + (body || '(없음)') + after
  if (full.length <= PER_LINK) return { url, text: full, truncated: fitted.cut }
  const room = Math.max(0, PER_LINK - before.length - CUT.length - after.length)
  // 머리(제목·브랜치 이름)가 유난히 길 때만 마지막 자르기가 닿는다
  return {
    url,
    text: (before + body.slice(0, room) + CUT + after).slice(0, PER_LINK),
    truncated: true
  }
}

// ui-hangul-ignore: AI 에게 보내는 주소 내용 머리(범위 밖: AI 프롬프트)
const pullState = (pull: unknown): string => {
  if (field(pull, 'merged') === true) return '합쳐짐'
  if (field(pull, 'state') === 'closed') return '닫힘'
  return field(pull, 'draft') === true ? '열림(초안)' : '열림'
}

const fileLine = (file: unknown): string =>
  `- ${text(field(file, 'status'))} +${count(field(file, 'additions'))} −${count(field(file, 'deletions'))} ${text(field(file, 'filename'))}`

/** 주소 하나를 읽은 결과 — 글과 알림은 따로다(파일 목록만 못 읽으면 둘 다 있다) */
type Read = { doc: LinkDoc | null; notice: string | null }

const readPull = async (deps: GithubCall, link: GithubLink): Promise<Read> => {
  const base = `/repos/${link.owner}/${link.repo}/pulls/${link.number}`
  const [got, files] = await Promise.all([get(deps, base), get(deps, `${base}/files?per_page=100`)])
  if (!got.ok) return { doc: null, notice: got.reason }
  const pull = got.body
  const total = count(field(pull, 'changed_files'))
  // ui-hangul-ignore: AI 에게 보내는 주소 내용 머리(범위 밖: AI 프롬프트)
  const head = [
    `${link.owner}/${link.repo} PR #${link.number}`,
    `제목: ${text(field(pull, 'title'))}`,
    `상태: ${pullState(pull)}`,
    `작성자: ${text(field(field(pull, 'user'), 'login'))}`,
    `브랜치: ${text(field(field(pull, 'head'), 'ref'))} → ${text(field(field(pull, 'base'), 'ref'))}`,
    `변경: 파일 ${total}개 (+${count(field(pull, 'additions'))} −${count(field(pull, 'deletions'))})`
  ]
  const body = text(field(pull, 'body'))
  // 파일 목록만 못 읽었으면 본문은 싣되, 목록이 없다는 것을 엔진과 사용자 둘 다에게 말한다
  if (!files.ok || !Array.isArray(files.body)) {
    return {
      doc: fit(link.url, head, body, [FILES_MISSING]),
      notice: mainT().githubMain.filesUnread
    }
  }
  const list = files.body
  // ui-hangul-ignore: AI 에게 보내는 주소 내용 머리(범위 밖: AI 프롬프트)
  const title = total > list.length ? `변경 파일(${total}개 중 첫 ${list.length}개):` : '변경 파일:'
  const tail = list.length === 0 ? [] : [title, ...list.map(fileLine)]
  return { doc: fit(link.url, head, body, tail), notice: null }
}

const readIssue = async (deps: GithubCall, link: GithubLink): Promise<Read> => {
  const got = await get(deps, `/repos/${link.owner}/${link.repo}/issues/${link.number}`)
  if (!got.ok) return { doc: null, notice: got.reason }
  const issue = got.body
  // ui-hangul-ignore: AI 에게 보내는 주소 내용 머리(범위 밖: AI 프롬프트)
  const head = [
    `${link.owner}/${link.repo} 이슈 #${link.number}`,
    `제목: ${text(field(issue, 'title'))}`,
    `상태: ${field(issue, 'state') === 'closed' ? '닫힘' : '열림'}`,
    `작성자: ${text(field(field(issue, 'user'), 'login'))}`
  ]
  return { doc: fit(link.url, head, text(field(issue, 'body')), []), notice: null }
}

/** 질문에 든 주소를 읽는다. 주소가 없으면 GitHub 를 부르지 않는다. 못 읽은 것은 notices 로 — 던지지 않는다 */
export const readGithubLinks = async (deps: GithubCall, question: string): Promise<LinkContext> => {
  const links = githubLinksIn(question)
  const read = await Promise.all(
    links
      .slice(0, MAX_LINKS)
      .map((link) => (link.kind === 'pull' ? readPull(deps, link) : readIssue(deps, link)))
  )
  const notices = new Set(read.map((one) => one.notice).filter((notice) => notice !== null))
  if (links.length > MAX_LINKS) notices.add(mainT().githubMain.tooManyLinks(MAX_LINKS))
  return {
    docs: read.map((one) => one.doc).filter((doc) => doc !== null),
    notices: [...notices]
  }
}
