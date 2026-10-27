// 웹 탭 주소칸의 판정 — 렌더러(주소칸)와 main(이동 허용)이 같이 쓴다.
// 주소칸은 검색창이 아니다: 점(.)·localhost·IP 가 없는 말은 주소로 보지 않는다(검색 엔진을 들이지 않는다).
// 앱 안에서 여는 것은 http(s) 뿐이다 — file:·vault:·javascript: 로 가면 보관함·앱에 닿는다.

export type WebAddress =
  { ok: true; url: string } | { ok: false; reason: 'empty' | 'not-address' | 'scheme' }

/** http(s) 로 시작하는 올바른 주소인가 */
export const isWebUrl = (raw: string): boolean => {
  try {
    const { protocol } = new URL(raw)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

// `localhost:3000` 도 URL 로는 스킴 `localhost:` 로 읽힌다 — 스킴은 `//` 가 붙었거나 알려진 것만 스킴으로 본다
const SCHEME = /^([a-z][a-z0-9+.-]*):(\/\/)?/i
const KNOWN_SCHEMES = new Set([
  'http',
  'https',
  'file',
  'javascript',
  'data',
  'mailto',
  'about',
  'vault',
  'blob',
  'chrome',
  'devtools',
  'ftp',
  'ws',
  'wss'
])
const LOCAL_HOST = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])(:\d+)?([/?#]|$)/i

export const normalizeWebAddress = (input: string): WebAddress => {
  const text = input.trim()
  if (text === '') return { ok: false, reason: 'empty' }
  const scheme = SCHEME.exec(text)
  if (scheme && (scheme[2] || KNOWN_SCHEMES.has(scheme[1].toLowerCase()))) {
    return isWebUrl(text) ? { ok: true, url: new URL(text).href } : { ok: false, reason: 'scheme' }
  }
  if (/\s/.test(text)) return { ok: false, reason: 'not-address' }
  const local = LOCAL_HOST.test(text)
  const host = text.split(/[/?#]/)[0]
  if (!local && !host.includes('.')) return { ok: false, reason: 'not-address' }
  const candidate = `${local ? 'http' : 'https'}://${text}`
  return isWebUrl(candidate)
    ? { ok: true, url: new URL(candidate).href }
    : { ok: false, reason: 'not-address' }
}
