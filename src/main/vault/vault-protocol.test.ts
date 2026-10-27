import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  handleVaultPreview,
  handleVaultPreviewFor,
  handleVaultRequest,
  handleVaultRequestFor
} from './vault-protocol'
import { docx, wP } from '../clip/office-fixture.test-util'

let vault: string

beforeAll(() => {
  vault = mkdtempSync(join(tmpdir(), 'vault-protocol-'))
  mkdirSync(join(vault, 'wiki'))
  writeFileSync(join(vault, 'wiki', 'a.md'), '# hi')
  writeFileSync(join(vault, 'wiki', 'img.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  writeFileSync(join(vault, 'wiki', 'big.pdf'), Buffer.alloc(21 * 1024 * 1024))
  writeFileSync(join(vault, 'wiki', 'evil.sh'), '#!/bin/sh')
  writeFileSync(join(vault, 'wiki', 'clip.mp4'), Buffer.alloc(30 * 1024 * 1024, 7))
  writeFileSync(join(vault, 'wiki', 'tone.mp3'), Buffer.from('0123456789'))
  writeFileSync(join(vault, 'wiki', 'big.txt'), Buffer.alloc(21 * 1024 * 1024))
  writeFileSync(join(vault, 'wiki', 'empty.mp3'), Buffer.alloc(0))
  writeFileSync(join(vault, 'wiki', 'table.base'), 'views: []')
  writeFileSync(join(vault, 'wiki', 'page.html'), '<p>hi</p><script>1</script>')
  docx(join(vault, 'wiki'), 'memo.docx', wP('메모 본문'))
  writeFileSync(join(vault, 'wiki', 'broken.pptx'), 'not a zip')
  writeFileSync(join(vault, 'wiki', 'huge.docx'), Buffer.alloc(21 * 1024 * 1024))
})

afterAll(() => {
  rmSync(vault, { recursive: true, force: true })
})

describe('handleVaultRequest', () => {
  it('html 은 기본이 글자다 — ?page 를 붙여야 페이지가 된다', async () => {
    const plain = handleVaultRequest(vault, new URL('vault://local/wiki/page.html'))
    expect(plain.headers.get('Content-Type')).toContain('text/plain')

    const page = handleVaultRequest(vault, new URL('vault://local/wiki/page.html?page'))
    expect(page.status).toBe(200)
    expect(page.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(await page.text()).toContain('<script>1</script>')
  })

  it('페이지로 내준 html 은 갇힌다 — 스크립트는 돌지만 보관함의 다른 파일에는 닿지 못한다', () => {
    const page = handleVaultRequest(vault, new URL('vault://local/wiki/page.html?page'))
    const csp = page.headers.get('Content-Security-Policy') ?? ''
    // 고유 출처 없이(same-origin 없음) 스크립트만 허용
    expect(csp).toMatch(/(^|;)\s*sandbox allow-scripts\s*(;|$)/)
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("connect-src 'none'")
    expect(csp).not.toContain('vault:')
    // 다른 출처에서 읽어 가는 길(CORS)을 열지 않는다
    expect(page.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('?page 는 html 에만 듣는다', () => {
    const md = handleVaultRequest(vault, new URL('vault://local/wiki/a.md?page'))
    expect(md.headers.get('Content-Type')).toContain('text/markdown')
    expect(md.headers.get('Content-Security-Policy')).toBeNull()
  })

  it('md 파일을 text/markdown으로 돌려준다', async () => {
    const res = handleVaultRequest(vault, new URL('vault://local/wiki/a.md'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/markdown')
    expect(await res.text()).toBe('# hi')
  })

  it('png를 image/png로 돌려준다', () => {
    const res = handleVaultRequest(vault, new URL('vault://local/wiki/img.png'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('호스트 부분은 무시하고 경로만 본다', () => {
    expect(handleVaultRequest(vault, new URL('vault://anything/wiki/a.md')).status).toBe(200)
  })

  it('화이트리스트 밖 확장자는 403 — 코드 형식(.sh)은 글자로 서브한다', async () => {
    expect(handleVaultRequest(vault, new URL('vault://local/wiki/evil.docx')).status).toBe(403)
    const res = handleVaultRequest(vault, new URL('vault://local/wiki/evil.sh'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/plain')
    expect(await res.text()).toContain('#!/bin/sh')
  })

  it('20MB 초과는 403', () => {
    expect(handleVaultRequest(vault, new URL('vault://local/wiki/big.pdf')).status).toBe(403)
  })

  it('볼트 밖 경로는 403', () => {
    // URL 정규화를 피한 인코딩 우회도 resolveInVault에서 거절된다
    expect(handleVaultRequest(vault, new URL('vault://local/%2e%2e%2foutside.md')).status).toBe(403)
    expect(handleVaultRequest(vault, new URL('vault://local/.git/config')).status).toBe(403)
  })

  it('영상은 20MB 를 넘어도 서브한다 — 통째로 읽지 않는다', async () => {
    const res = handleVaultRequest(vault, new URL('vault://local/wiki/clip.mp4'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('video/mp4')
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect(res.headers.get('Content-Length')).toBe(String(30 * 1024 * 1024))
    await res.body?.cancel()
  })

  it('소리·영상 아닌 형식은 20MB 상한을 지킨다', () => {
    expect(handleVaultRequest(vault, new URL('vault://local/wiki/big.txt')).status).toBe(403)
  })

  it('빈 파일에 끝에서 센 Range 는 416 — 읽기가 죽지 않는다', () => {
    const res = handleVaultRequest(vault, new URL('vault://local/wiki/empty.mp3'), 'bytes=-5')
    expect(res.status).toBe(416)
  })

  it('Range 요청에 206 과 그 구간 바이트로 답한다', async () => {
    const res = handleVaultRequest(vault, new URL('vault://local/wiki/tone.mp3'), 'bytes=2-5')
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(res.headers.get('Content-Length')).toBe('4')
    expect(await res.text()).toBe('2345')
  })

  it('끝이 열린 Range 는 파일 끝까지', async () => {
    const res = handleVaultRequest(vault, new URL('vault://local/wiki/tone.mp3'), 'bytes=7-')
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 7-9/10')
    expect(await res.text()).toBe('789')
  })

  it('끝에서 센 Range 도 받는다', async () => {
    const res = handleVaultRequest(vault, new URL('vault://local/wiki/tone.mp3'), 'bytes=-3')
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 7-9/10')
    expect(await res.text()).toBe('789')
  })

  it('해석 못 하는 Range 는 무시하고 전체를 준다', async () => {
    const res = handleVaultRequest(vault, new URL('vault://local/wiki/tone.mp3'), 'bytes=abc')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Range')).toBeNull()
    expect(await res.text()).toBe('0123456789')
  })

  it('파일 밖 Range 는 416', async () => {
    const res = handleVaultRequest(vault, new URL('vault://local/wiki/tone.mp3'), 'bytes=99-')
    expect(res.status).toBe(416)
    expect(res.headers.get('Content-Range')).toBe('bytes */10')
  })

  it('Range 가 붙어도 경로·확장자 검사가 먼저다', () => {
    expect(
      handleVaultRequest(vault, new URL('vault://local/wiki/evil.docx'), 'bytes=0-1').status
    ).toBe(403)
    expect(
      handleVaultRequest(vault, new URL('vault://local/%2e%2e%2foutside.md'), 'bytes=0-1').status
    ).toBe(403)
  })

  it('.base 는 vault:// 로 서브하지 않는다 — IPC 로 읽는다', () => {
    expect(handleVaultRequest(vault, new URL('vault://local/wiki/table.base')).status).toBe(403)
  })

  it('없는 파일은 404', () => {
    expect(handleVaultRequest(vault, new URL('vault://local/wiki/ghost.md')).status).toBe(404)
  })
})

describe('handleVaultRequestFor — test: vault-protocol vault scope', () => {
  it('앞 보관함에 없으면 뒤에서 찾는다', async () => {
    const other = mkdtempSync(join(tmpdir(), 'vault-protocol-b-'))
    try {
      mkdirSync(join(other, 'wiki'))
      writeFileSync(join(other, 'wiki', 'only-b.md'), '# b')
      const res = handleVaultRequestFor(
        [vault, other],
        new URL('vault://local/wiki/only-b.md'),
        null
      )
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('# b')
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })

  it('둘 다 없으면 404, 밖 경로는 403', () => {
    expect(
      handleVaultRequestFor([vault], new URL('vault://local/wiki/ghost.md'), null).status
    ).toBe(404)
    expect(
      handleVaultRequestFor([vault], new URL('vault://local/%2e%2e%2foutside.md'), null).status
    ).toBe(403)
  })
})

describe('handleVaultPreview — 워드·파워포인트 미리보기', () => {
  const preview = (rel: string): Promise<Response> =>
    handleVaultPreview(vault, new URL(`vault://local/${rel}?preview`))

  it('HTML 로 내주고, CSP 는 스크립트·바깥 자원 없이 data: 그림만 연다', async () => {
    const res = await preview('wiki/memo.docx')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    const csp = res.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain('sandbox')
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain('img-src data:')
    expect(csp).not.toContain('script-src')
    expect(await res.text()).toContain('메모 본문')
  })

  it('원본 바이트는 그대로 내주지 않는다(?preview 없는 길은 403)', () => {
    expect(handleVaultRequest(vault, new URL('vault://local/wiki/memo.docx')).status).toBe(403)
  })

  it('워드·파워포인트가 아니면 403, 보관함 밖 403, 없으면 404, 20MB 넘으면 413, 못 읽으면 422', async () => {
    expect((await preview('wiki/a.md')).status).toBe(403)
    expect((await preview('%2e%2e%2fmemo.docx')).status).toBe(403)
    expect((await preview('wiki/none.docx')).status).toBe(404)
    expect((await preview('wiki/huge.docx')).status).toBe(413)
    expect((await preview('wiki/broken.pptx')).status).toBe(422)
  })

  it('여러 보관함 — 앞 보관함에 없으면 뒤에서 찾는다', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'vault-preview-empty-'))
    try {
      const url = new URL('vault://local/wiki/memo.docx?preview')
      expect((await handleVaultPreviewFor([empty, vault], url)).status).toBe(200)
      expect((await handleVaultPreviewFor([empty], url)).status).toBe(404)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})
