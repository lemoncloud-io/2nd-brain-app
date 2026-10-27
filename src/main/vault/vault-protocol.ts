import { statSync, readFileSync, createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { resolveInVault } from './vault-path'
import { fileKind, mimeOf, isStreamed } from '../../shared/vault-file-types'
import { officePreviewHtml } from './office-preview'

const MAX_BYTES = 20 * 1024 * 1024

/**
 * `?page` 로 부른 html 의 울타리 — 스크립트는 돌되 고유 출처가 없다(same-origin 없는 sandbox).
 * vault:// 응답은 CORS 를 모두 열어 두므로 fetch·vault: 자원을 막지 않으면 페이지가 보관함의 다른 파일을 읽는다.
 * 바깥 글꼴·그림·CDN 스크립트는 브라우저로 연 것처럼 받는다.
 */
export const HTML_PAGE_CSP = [
  'sandbox allow-scripts',
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' https:",
  "style-src 'unsafe-inline' https:",
  'img-src data: blob: https:',
  'font-src data: https:',
  'media-src data: blob: https:',
  "connect-src 'none'"
].join('; ')

/**
 * `?preview` 응답을 주소로 바로 열 때의 울타리 — 스크립트도 바깥 자원도 없다. 그림은 data: 로만 실려 온다.
 * 앱은 fetch → srcdoc 으로 띄우므로 거기서는 sandbox="" 와 창의 CSP 가 막는다(`views/sources-office.tsx`)
 */
export const OFFICE_PREVIEW_CSP = [
  'sandbox',
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src data:'
].join('; ')

/**
 * `bytes=0-99`·`bytes=100-`·`bytes=-500` 만 읽는다. 여러 구간(`a-b,c-d`)은 안 받는다 — 미디어 요소가 쓰지 않는다.
 * 해석 못 한 Range 는 `'ignore'`(RFC 7233: 무시하고 전체를 준다), 파일 밖을 가리키면 `'unsatisfiable'`(416).
 */
type Wanted = { start: number; end: number } | 'ignore' | 'unsatisfiable'

const parseRange = (header: string, size: number): Wanted => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return 'ignore'
  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return 'ignore'
  // `bytes=-500` = 끝에서 500바이트
  if (rawStart === '') {
    const length = Number(rawEnd)
    // 빈 파일에는 줄 뒤꼬리가 없다 — 여기서 거르지 않으면 end 가 -1 이 돼 읽기가 그 자리에서 죽는다
    if (length === 0 || size === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - length), end: size - 1 }
  }
  const start = Number(rawStart)
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  if (start > end || start >= size) return 'unsatisfiable'
  return { start, end }
}

/**
 * `vault://<무시되는 호스트>/<볼트 상대경로>` 요청 핸들러.
 * 같은 `resolveInVault` 검사·확장자 화이트리스트(`shared/vault-file-types`)를 거친다.
 * 거절 403, 없음 404, 범위 밖 416. svg는 Content-Type으로만 서브 — 인라인하지 않는다.
 * 소리·영상은 통째로 읽지 않고 흘려보낸다(Range 206) — 수백 MB 파일도 탐색된다.
 * 그 밖 형식은 20MB 상한을 그대로 지킨다.
 * html 은 글자로 내주고, `?page` 일 때만 `HTML_PAGE_CSP` 에 갇힌 페이지로 내준다.
 */
export function handleVaultRequest(vaultDir: string, url: URL, range?: string | null): Response {
  const rel = decodeURIComponent(url.pathname).replace(/^\//, '')
  const full = resolveInVault(vaultDir, rel)
  if (full === null) return new Response('forbidden', { status: 403 })

  const contentType = mimeOf(full)
  if (contentType === null) return new Response('forbidden', { status: 403 })

  let size: number
  try {
    size = statSync(full).size
  } catch {
    return new Response('not found', { status: 404 })
  }

  if (!isStreamed(full)) {
    if (size > MAX_BYTES) return new Response('forbidden', { status: 403 })
    let bytes: Buffer
    try {
      bytes = readFileSync(full)
    } catch {
      return new Response('not found', { status: 404 })
    }
    if (url.searchParams.has('page') && fileKind(full) === 'html') {
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': HTML_PAGE_CSP
        }
      })
    }
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' }
    })
  }

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes'
  }
  const parsed = range ? parseRange(range, size) : 'ignore'
  if (parsed === 'unsatisfiable') {
    return new Response('range not satisfiable', {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${size}` }
    })
  }
  const wanted = parsed === 'ignore' ? null : parsed
  const start = wanted?.start ?? 0
  const end = wanted?.end ?? Math.max(0, size - 1)
  headers['Content-Length'] = String(size === 0 ? 0 : end - start + 1)
  if (wanted) headers['Content-Range'] = `bytes ${start}-${end}/${size}`

  const stream = createReadStream(full, { start, end })
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status: wanted ? 206 : 200,
    headers
  })
}

/**
 * `vault://<호스트>/<상대경로>?preview` — 워드·파워포인트를 미리보기 HTML 로 바꿔 내준다.
 * 거절 403, 없음 404, 20MB 넘음 413, 읽지 못함(손상·너무 크게 풀림·DOCTYPE) 422 — 렌더러가 상태로 문구를 고른다
 */
export async function handleVaultPreview(vaultDir: string, url: URL): Promise<Response> {
  const rel = decodeURIComponent(url.pathname).replace(/^\//, '')
  const full = resolveInVault(vaultDir, rel)
  if (full === null || fileKind(full) !== 'office')
    return new Response('forbidden', { status: 403 })
  let size: number
  try {
    size = statSync(full).size
  } catch {
    return new Response('not found', { status: 404 })
  }
  if (size > MAX_BYTES) return new Response('too big', { status: 413 })
  try {
    return new Response(await officePreviewHtml(full), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': OFFICE_PREVIEW_CSP
      }
    })
  } catch (err) {
    console.warn('document preview failed', rel, err)
    return new Response('unreadable', { status: 422 })
  }
}

/**
 * 여러 보관함에서 순서대로 찾는다 — 앞 보관함에 그 파일이 없으면(404) 뒤에서 찾고,
 * 처음 맞는 것을 돌려준다. 밖 경로·막힌 확장자(403)는 어느 보관함에서도 같아 그대로 둔다.
 * 호출부는 앞에 둔 보관함을 정한다 — 보통 앞에 있는 창의 보관함.
 */
export function handleVaultRequestFor(
  vaultDirs: string[],
  url: URL,
  range?: string | null
): Response {
  let notFound: Response | null = null
  for (const dir of vaultDirs) {
    const res = handleVaultRequest(dir, url, range)
    if (res.status !== 404) return res
    notFound = res
  }
  return notFound ?? new Response('forbidden', { status: 403 })
}

/** `handleVaultPreview` 를 여러 보관함에서 — 찾는 순서는 `handleVaultRequestFor` 와 같다 */
export const handleVaultPreviewFor = async (vaultDirs: string[], url: URL): Promise<Response> => {
  let notFound: Response | null = null
  for (const dir of vaultDirs) {
    const res = await handleVaultPreview(dir, url)
    if (res.status !== 404) return res
    notFound = res
  }
  return notFound ?? new Response('forbidden', { status: 403 })
}
