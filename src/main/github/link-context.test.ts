import { describe, expect, it, vi, type Mock } from 'vitest'
import { githubLinksIn, readGithubLinks } from './link-context'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const PR_URL = 'https://github.com/team/vault/pull/693'

const pullBody = {
  number: 693,
  title: '카메라 롤 내려받기',
  state: 'open',
  draft: false,
  merged: false,
  user: { login: 'louis' },
  head: { ref: 'feat/camera-roll' },
  base: { ref: 'main' },
  body: '원본 사진을 기기에 저장한다',
  changed_files: 2,
  additions: 40,
  deletions: 3
}

const filesBody = [
  { filename: 'docs/SPEC.md', status: 'modified', additions: 30, deletions: 3 },
  { filename: 'docs/NEW.md', status: 'added', additions: 10, deletions: 0 }
]

/** 경로별로 답하는 가짜 GitHub */
const fakeGithub = (routes: Record<string, () => Response>): Mock<typeof globalThis.fetch> =>
  vi.fn<typeof globalThis.fetch>(async (url) => {
    const path = String(url).replace('https://api.github.com', '')
    return routes[path]?.() ?? json({ message: 'Not Found' }, 404)
  })

describe('githubLinksIn', () => {
  it.each([
    [`${PR_URL} 이거할까함`, [PR_URL]],
    [`이것(${PR_URL}/files#diff-1) 봐줘.`, [PR_URL]],
    [`${PR_URL} 그리고 또 ${PR_URL}`, [PR_URL]],
    ['https://github.com/team/vault 저장소', []],
    ['https://github.com.evil.com/team/vault/pull/1', []],
    ['https://notgithub.com/team/vault/pull/1', []],
    ['http://github.com/team/vault/pull/1', []],
    ['https://github.com/team/../pull/1', []],
    ['https://github.com/team/vault/pull/abc', []],
    ['https://evil.com/github.com/team/vault/pull/1', []],
    ['https://github.com/te%2Fam/vault/pull/1', []],
    ['https://github.com/team/vault?x=/pull/1', []],
    ['https://github.com/team/a/b/pull/1', []],
    ['https://github.com/team/vault/pull/1234567890', []],
    [`봐줘.${PR_URL}`, [PR_URL]],
    ['주소 없는 질문', []]
  ])('%s', (text, expected) => {
    expect(githubLinksIn(text).map((link) => link.url)).toEqual(expected)
  })

  it('이슈 주소도 읽는다', () => {
    expect(githubLinksIn('https://github.com/team/vault/issues/12 봐줘')).toEqual([
      {
        owner: 'team',
        repo: 'vault',
        kind: 'issue',
        number: 12,
        url: 'https://github.com/team/vault/issues/12'
      }
    ])
  })

  it('주소에서 저장소와 번호를 읽는다', () => {
    expect(githubLinksIn(PR_URL)).toEqual([
      { owner: 'team', repo: 'vault', kind: 'pull', number: 693, url: PR_URL }
    ])
  })
})

describe('readGithubLinks', () => {
  it('PR 의 제목·상태·작성자·브랜치·본문·변경 파일을 한 덩어리로 읽어 온다', async () => {
    const fetchMock = fakeGithub({
      '/repos/team/vault/pulls/693': () => json(pullBody),
      '/repos/team/vault/pulls/693/files?per_page=100': () => json(filesBody)
    })
    const result = await readGithubLinks(
      { token: 'gho_x', fetch: fetchMock },
      `${PR_URL} 이거할까함`
    )
    expect(result.notices).toEqual([])
    expect(result.docs).toHaveLength(1)
    const [doc] = result.docs
    expect(doc?.url).toBe(PR_URL)
    expect(doc?.truncated).toBe(false)
    expect(doc?.text).toContain('team/vault PR #693')
    expect(doc?.text).toContain('제목: 카메라 롤 내려받기')
    expect(doc?.text).toContain('상태: 열림')
    expect(doc?.text).toContain('작성자: louis')
    expect(doc?.text).toContain('feat/camera-roll → main')
    expect(doc?.text).toContain('원본 사진을 기기에 저장한다')
    expect(doc?.text).toContain('- modified +30 −3 docs/SPEC.md')
    expect(doc?.text).toContain('- added +10 −0 docs/NEW.md')
  })

  it.each([
    [{ state: 'closed', merged: true }, '상태: 합쳐짐'],
    [{ state: 'closed', merged: false }, '상태: 닫힘'],
    [{ state: 'open', draft: true }, '상태: 열림(초안)']
  ])('PR 상태 %j', async (patch, expected) => {
    const fetchMock = fakeGithub({
      '/repos/team/vault/pulls/693': () => json({ ...pullBody, ...patch }),
      '/repos/team/vault/pulls/693/files?per_page=100': () => json([])
    })
    const result = await readGithubLinks({ token: 'gho_x', fetch: fetchMock }, PR_URL)
    expect(result.docs[0]?.text).toContain(expected)
  })

  it('파일 목록을 못 읽어도 PR 본문은 싣는다', async () => {
    const fetchMock = fakeGithub({ '/repos/team/vault/pulls/693': () => json(pullBody) })
    const result = await readGithubLinks({ token: 'gho_x', fetch: fetchMock }, PR_URL)
    expect(result.docs[0]?.text).toContain('제목: 카메라 롤 내려받기')
    expect(result.docs[0]?.text).not.toContain('변경 파일:')
    // 조용히 빼지 않는다 — 엔진도 사용자도 목록이 없다는 것을 안다
    expect(result.docs[0]?.text).toContain('(변경 파일 목록을 읽지 못했다)')
    expect(result.notices).toEqual([expect.stringContaining('변경 파일 목록')])
  })

  it('파일이 100개를 넘으면 첫 100개만 실었다고 적는다', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ ...filesBody[0], filename: `f${i}.md` }))
    const fetchMock = fakeGithub({
      '/repos/team/vault/pulls/693': () => json({ ...pullBody, changed_files: 250 }),
      '/repos/team/vault/pulls/693/files?per_page=100': () => json(many)
    })
    const result = await readGithubLinks({ token: 'gho_x', fetch: fetchMock }, PR_URL)
    expect(result.docs[0]?.text).toContain('변경 파일(250개 중 첫 100개):')
  })

  it('파일 목록이 길어도 본문을 밀어내지 않는다 — 목록은 줄 단위로 자른다', async () => {
    const long = Array.from({ length: 100 }, (_, i) => ({
      ...filesBody[0],
      filename: `${'d/'.repeat(100)}f${i}.md`
    }))
    const fetchMock = fakeGithub({
      '/repos/team/vault/pulls/693': () => json(pullBody),
      '/repos/team/vault/pulls/693/files?per_page=100': () => json(long)
    })
    const result = await readGithubLinks({ token: 'gho_x', fetch: fetchMock }, PR_URL)
    const text = result.docs[0]?.text ?? ''
    expect(text.length).toBeLessThanOrEqual(12_000)
    expect(result.docs[0]?.truncated).toBe(true)
    expect(text).toContain('원본 사진을 기기에 저장한다')
    expect(text).not.toContain('(본문 뒤가 잘렸다)')
    expect(text.endsWith('(파일 목록 뒤가 잘렸다)')).toBe(true)
    expect(text.split('\n').at(-2)).toMatch(/f\d+\.md$/)
  })

  it('주소는 앞의 3개만 읽고, 나머지는 읽지 않았다고 알린다', async () => {
    const fetchMock = fakeGithub({})
    const urls = [1, 2, 3, 4].map((n) => `https://github.com/team/vault/pull/${n}`)
    for (const n of [1, 2, 3, 4]) {
      fetchMock.mockImplementationOnce(async () => json({ ...pullBody, number: n }))
      fetchMock.mockImplementationOnce(async () => json([]))
    }
    const result = await readGithubLinks({ token: 'gho_x', fetch: fetchMock }, urls.join(' '))
    expect(result.docs.map((doc) => doc.url)).toEqual(urls.slice(0, 3))
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/pulls/4'))).toBe(false)
    expect(result.notices).toEqual([expect.stringContaining('3개까지')])
  })

  it('긴 글은 12,000자에서 자르고 잘렸다고 적는다', async () => {
    const fetchMock = fakeGithub({
      '/repos/team/vault/pulls/693': () => json({ ...pullBody, body: '가'.repeat(20_000) }),
      '/repos/team/vault/pulls/693/files?per_page=100': () => json(filesBody)
    })
    const result = await readGithubLinks({ token: 'gho_x', fetch: fetchMock }, PR_URL)
    expect(result.docs[0]?.truncated).toBe(true)
    expect(result.docs[0]?.text).toHaveLength(12_000)
    // 자르는 것은 본문이다 — 뒤에 붙는 변경 파일 목록은 남는다
    expect(result.docs[0]?.text).toContain('- added +10 −0 docs/NEW.md')
    expect(result.docs[0]?.text).toContain('(본문 뒤가 잘렸다)\n\n변경 파일:')
  })

  it('이슈의 제목·상태·작성자·본문을 읽어 온다', async () => {
    const fetchMock = fakeGithub({
      '/repos/team/vault/issues/12': () =>
        json({
          title: '로그인이 풀린다',
          state: 'closed',
          user: { login: 'mina' },
          body: '재현 순서'
        })
    })
    const url = 'https://github.com/team/vault/issues/12'
    const result = await readGithubLinks({ token: 'gho_x', fetch: fetchMock }, url)
    expect(result.notices).toEqual([])
    expect(result.docs).toEqual([
      {
        url,
        truncated: false,
        text: [
          'team/vault 이슈 #12',
          '제목: 로그인이 풀린다',
          '상태: 닫힘',
          '작성자: mina',
          '',
          '본문:',
          '재현 순서'
        ].join('\n')
      }
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('로그인 전이면 GitHub 를 부르지 않고 로그인하라고 알린다 — 주소가 여럿이어도 한 번만', async () => {
    const fetchMock = fakeGithub({})
    const result = await readGithubLinks(
      { token: null, fetch: fetchMock },
      `${PR_URL} https://github.com/team/vault/issues/12`
    )
    expect(result.docs).toEqual([])
    expect(result.notices).toEqual([expect.stringContaining('로그인')])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [401, { message: 'Bad credentials' }, '다시 로그인'],
    [403, { message: 'Resource protected by organization SAML enforcement' }, '조직 관리자'],
    [403, { message: 'Forbidden' }, '볼 수 있는지'],
    [404, { message: 'Not Found' }, '볼 수 있는지'],
    [403, { message: 'API rate limit exceeded for user ID 1.' }, '잠시 뒤'],
    [500, { message: 'boom' }, '(500)']
  ])('GitHub 가 %i 로 답하면 이유와 할 일을 알린다', async (status, body, expected) => {
    const fetchMock = fakeGithub({ '/repos/team/vault/pulls/693': () => json(body, status) })
    const result = await readGithubLinks({ token: 'gho_x', fetch: fetchMock }, PR_URL)
    expect(result.docs).toEqual([])
    expect(result.notices).toEqual([expect.stringContaining(expected)])
    // 원문 응답·토큰은 알림에 싣지 않는다
    expect(result.notices.join(' ')).not.toContain('gho_x')
    expect(result.notices.join(' ')).not.toContain(body.message)
  })

  it('GitHub 에 닿지 못하면 연결을 확인하라고 알린다', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    const result = await readGithubLinks({ token: 'gho_x', fetch: fetchMock }, PR_URL)
    expect(result.docs).toEqual([])
    expect(result.notices).toEqual([expect.stringContaining('연결')])
  })

  it('하나를 못 읽어도 읽은 것은 싣는다', async () => {
    const fetchMock = fakeGithub({
      '/repos/team/vault/pulls/693': () => json(pullBody),
      '/repos/team/vault/pulls/693/files?per_page=100': () => json(filesBody)
    })
    const result = await readGithubLinks(
      { token: 'gho_x', fetch: fetchMock },
      `${PR_URL} https://github.com/team/gone/issues/1`
    )
    expect(result.docs.map((doc) => doc.url)).toEqual([PR_URL])
    expect(result.notices).toHaveLength(1)
  })

  it('주소가 없으면 GitHub 를 부르지 않는다', async () => {
    const fetchMock = fakeGithub({})
    const result = await readGithubLinks({ token: 'gho_x', fetch: fetchMock }, '사과가 뭐야')
    expect(result).toEqual({ docs: [], notices: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
