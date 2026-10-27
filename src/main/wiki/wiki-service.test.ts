import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync as mk,
  mkdirSync as md,
  readFileSync as rf,
  rmSync,
  writeFileSync as wf
} from 'node:fs'
import { WikiService } from './wiki-service'
import { searchPages } from '../../shared/wiki/search'
import { git } from '../git'
import { createVault, VAULT_SKELETON } from '../vault/vault-service'
import { vaultActivity } from '../vault/vault-activity'
import { INGEST_LOCK } from '../engine/claude-engine'

let vault: string

beforeAll(() => {
  vault = mkdtempSync(join(tmpdir(), 'wiki-service-'))
  mkdirSync(join(vault, 'wiki', 'topics'), { recursive: true })
  writeFileSync(
    join(vault, 'wiki', 'INDEX.md'),
    '---\ntype: index\n---\n\n# INDEX\n\n- [[topics/ai]]\n'
  )
  writeFileSync(join(vault, 'wiki', 'topics', 'ai.md'), '# AI\n\n[[INDEX]]\n')
  const t = new Date('2026-09-14T00:00:00Z')
  utimesSync(join(vault, 'wiki', 'INDEX.md'), t, t)
})

describe('WikiService.list', () => {
  it('wiki/**/*.md를 스캔해 메타데이터를 돌려준다', () => {
    const pages = WikiService.list(vault)
    const rels = pages.map((p) => p.rel).sort()
    expect(rels).toEqual(['wiki/INDEX.md', 'wiki/topics/ai.md'])

    const index = pages.find((p) => p.rel === 'wiki/INDEX.md')!
    expect(index.slug).toBe('INDEX')
    expect(index.title).toBe('INDEX')
    expect(index.frontmatter).toEqual({ type: 'index' })
    expect(index.links.map((l) => l.target)).toEqual(['topics/ai'])
    expect(index.size).toBeGreaterThan(0)
    expect(index.mtimeMs).toBe(new Date('2026-09-14T00:00:00Z').getTime())
  })

  it('pageRefs 는 같은 페이지의 경로·이름·제목만 준다', () => {
    const refs = WikiService.pageRefs(vault).sort((a, b) => a.rel.localeCompare(b.rel))
    expect(refs).toEqual(
      WikiService.list(vault).map(({ rel, slug, title }) => ({ rel, slug, title }))
    )
  })

  it('wiki/ 가 비면 빈 배열 (뼈대 볼트)', () => {
    const empty = mkdtempSync(join(tmpdir(), 'wiki-empty-'))
    mkdirSync(join(empty, 'wiki'))
    expect(WikiService.list(empty)).toEqual([])
  })

  it('wiki/ 폴더 자체가 없으면(generic) throw 대신 빈 배열', () => {
    const generic = mkdtempSync(join(tmpdir(), 'wiki-generic-'))
    try {
      writeFileSync(join(generic, 'Home.md'), '# home\n')
      expect(WikiService.list(generic)).toEqual([])
      expect(WikiService.pageRefs(generic)).toEqual([])
      expect(WikiService.listDocs(generic)).toEqual([])
      expect(WikiService.tags(generic)).toEqual([])
    } finally {
      rmSync(generic, { recursive: true, force: true })
    }
  })

  it('wiki/ 폴더 자체가 없으면(generic) lint는 빈 구조 + verify 판정을 돌려준다', async () => {
    const generic = mkdtempSync(join(tmpdir(), 'wiki-generic-lint-'))
    try {
      writeFileSync(join(generic, 'Home.md'), '# home\n')
      const report = await WikiService.lint(generic, {
        verify: async () => ({ status: 'unavailable', reason: 'no vault' })
      })
      expect(report.structure).toEqual([])
      expect(report.verify.status).toBe('unavailable')
    } finally {
      rmSync(generic, { recursive: true, force: true })
    }
  })
})

describe('WikiService — 볼트 파일 링크', () => {
  it('wiki 페이지가 아니어도 볼트에 있는 파일로 이어진 링크는 vaultFile 로 표시하고 lint 는 깨진 링크로 보지 않는다', async () => {
    const dir = mk(join(tmpdir(), 'wiki-vault-links-'))
    try {
      md(join(dir, 'wiki'), { recursive: true })
      md(join(dir, 'projects', 'demo'), { recursive: true })
      wf(join(dir, 'projects', 'demo', 'README.md'), '# Demo\n')
      wf(
        join(dir, 'wiki', 'p.md'),
        '# P\n\n[[projects/demo/README|Demo]] [[projects/gone/README]] [[../outside]]\n'
      )
      wf(join(tmpdir(), 'outside.md'), '# 볼트 밖\n')
      const [p] = WikiService.list(dir)
      expect(p!.links.map((link) => [link.target, link.vaultFile === true])).toEqual([
        ['projects/demo/README', true],
        ['projects/gone/README', false],
        ['../outside', false]
      ])
      const report = await WikiService.lint(dir, { verify: async () => ({ status: 'pass' }) })
      expect(report.structure.flatMap((f) => (f.kind === 'broken-link' ? [f.target] : []))).toEqual(
        ['projects/gone/README', '../outside']
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('WikiService.read', () => {
  it('텍스트와 sha256 hash를 돌려준다', () => {
    const r = WikiService.read(vault, 'wiki/topics/ai.md')
    expect(r).not.toBeNull()
    expect(r!.text).toBe('# AI\n\n[[INDEX]]\n')
    expect(r!.hash).toBe(createHash('sha256').update('# AI\n\n[[INDEX]]\n').digest('hex'))
  })

  it('볼트 밖 경로는 null', () => {
    expect(WikiService.read(vault, '../outside.md')).toBeNull()
    expect(WikiService.read(vault, '.git/config')).toBeNull()
  })

  // 파일 트리는 보관함의 모든 md 를 연다 — 원본·양식·보관함 규칙까지
  it('숨김 폴더 밖이면 어느 md 든 읽는다 — 원본·보관함 맨 위 규칙', () => {
    mkdirSync(join(vault, 'raw'), { recursive: true })
    writeFileSync(join(vault, 'raw', 'dump.md'), 'dump')
    writeFileSync(join(vault, 'VAULT_RULES.md'), '# 규칙\n')
    expect(WikiService.read(vault, 'raw/dump.md')?.text).toBe('dump')
    expect(WikiService.read(vault, 'VAULT_RULES.md')?.text).toBe('# 규칙\n')
    // 트리·⌘K 는 확장자 대소문자를 가리지 않는다 — 리더도 같아야 한다
    writeFileSync(join(vault, 'wiki', 'Upper.MD'), '# 대문자\n')
    expect(WikiService.read(vault, 'wiki/Upper.MD')?.text).toBe('# 대문자\n')
  })

  it('숨김 폴더·md 아닌 파일·볼트 밖은 null', () => {
    mkdirSync(join(vault, '.obsidian'), { recursive: true })
    writeFileSync(join(vault, '.obsidian', 'note.md'), 'x')
    expect(WikiService.read(vault, '.obsidian/note.md')).toBeNull()
    expect(WikiService.read(vault, '../outside.md')).toBeNull()
    expect(WikiService.read(vault, 'wiki/notes.txt')).toBeNull()
  })

  it('wiki/ 밖 보관함 문서도 읽는다 — 검색 결과에서 바로 열린다', () => {
    mkdirSync(join(vault, 'projects', 'cloud-voucher'), { recursive: true })
    writeFileSync(join(vault, 'projects', 'cloud-voucher', 'README.md'), '# 클라우드바우처\n')
    expect(WikiService.read(vault, 'projects/cloud-voucher/README.md')?.text).toContain(
      '클라우드바우처'
    )
  })
})

describe('WikiService.checkboxCounts', () => {
  it('체크박스가 있는 md 만 수를 돌려준다 — 없는 파일·읽을 수 없는 경로는 빠진다', async () => {
    mkdirSync(join(vault, 'private'), { recursive: true })
    writeFileSync(join(vault, 'private', 'plan.md'), '# 계획\n- [x] 가\n- [ ] 나\n')
    writeFileSync(join(vault, 'private', 'memo.md'), '# 메모\n그냥 글\n')

    const counts = await WikiService.checkboxCounts(vault, [
      'private/plan.md',
      'private/memo.md',
      '../outside.md',
      'private/없는-파일.md'
    ])

    expect(counts).toEqual({ 'private/plan.md': { done: 1, total: 2 } })
  })

  it('코드 블록 안의 체크박스는 세지 않는다', async () => {
    writeFileSync(
      join(vault, 'private', 'fenced.md'),
      '- [ ] 진짜\n\n```md\n- [x] 예시\n- [x] 예시 둘\n```\n'
    )
    expect(await WikiService.checkboxCounts(vault, ['private/fenced.md'])).toEqual({
      'private/fenced.md': { done: 0, total: 1 }
    })
  })

  // 트리는 펼친 폴더 단위로 한 번에 묻는다 — 수백 개를 통째로 읽어 오면 실행이 멈춘다
  it('한 번에 묻는 파일 수를 제한한다', async () => {
    const rels = Array.from({ length: 600 }, (_, i) => `private/bulk-${i}.md`)
    writeFileSync(join(vault, 'private', 'bulk-0.md'), '- [ ] 가\n')
    writeFileSync(join(vault, 'private', 'bulk-599.md'), '- [ ] 나\n')
    const counts = await WikiService.checkboxCounts(vault, rels)
    expect(counts['private/bulk-0.md']).toEqual({ done: 0, total: 1 })
    expect(counts['private/bulk-599.md']).toBeUndefined()
  })
})

describe('WikiService.write', () => {
  const newVault = (): string => {
    const dir = mk(join(tmpdir(), 'wiki-write-'))
    createVault(dir, { skeleton: VAULT_SKELETON })
    md(join(dir, 'wiki', 'topics'), { recursive: true })
    wf(join(dir, 'wiki', 'topics', 'ai.md'), '---\ntype: page\ntitle: AI\n---\n\n# AI\n')
    git(dir, ['add', 'wiki/topics/ai.md'])
    git(dir, ['commit', '-m', 'init page'])
    return dir
  }
  const sha = (dir: string): string => git(dir, ['rev-parse', 'HEAD']).trim()

  it('저장 → edit: <slug> 커밋 1개, 바꾼 줄만 diff', async () => {
    const dir = newVault()
    const rel = 'wiki/topics/ai.md'
    const read = WikiService.read(dir, rel)!
    // 편집기 텍스트(원문 + 한 줄 변경)를 저장한다 — 디스크는 아직 건드리지 않는다
    const text2 = read.text.replace('# AI', '# 인공지능\n\n부제')
    const result = WikiService.write(dir, rel, text2, read.hash)
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(git(dir, ['log', '-1', '--format=%s']).trim()).toBe('edit: ai')
    // 커밋이 정확히 1개 생겼는지(이전 HEAD 대비)
    const diff = git(dir, ['diff', `${result.baseCommit}..HEAD`, '--unified=0', '--', rel])
    expect(diff).toMatch(/^\+# 인공지능$/m)
    // 바꾼 줄만 — frontmatter는 diff에 없다
    expect(diff).toMatch(/^-# AI$/m)
    expect(diff).not.toMatch(/^-type: page$/m)
    expect(git(dir, ['status', '--porcelain']).trim()).toBe('')
  })

  it('글이 건 붙여넣은 그림은 같은 edit: 커밋에 탄다', () => {
    const dir = newVault()
    const rel = 'wiki/topics/ai.md'
    md(join(dir, 'attachments'))
    wf(join(dir, 'attachments', 'Pasted image 1.png'), 'png')
    wf(join(dir, 'attachments', '안 건 그림.png'), 'png')
    const read = WikiService.read(dir, rel)!
    const result = WikiService.write(
      dir,
      rel,
      `${read.text}\n![[attachments/Pasted image 1.png]]\n`,
      read.hash
    )
    expect(result).toMatchObject({ ok: true })
    const files = git(dir, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n').sort()
    expect(files).toEqual(['attachments/Pasted image 1.png', rel])
    // 글이 걸지 않은 그림은 싣지 않는다
    expect(git(dir, ['status', '--porcelain', '--', 'attachments'])).toMatch(/안 건 그림/)
  })

  it('glob 문자가 든 문서명을 패턴으로 풀지 않고 글자로 더한다', () => {
    const dir = newVault()
    try {
      wf(
        join(dir, 'wiki', 'topics', 'note [d].md'),
        '---\ntype: page\ntitle: 메모\n---\n\n# 메모\n'
      )
      wf(join(dir, 'wiki', 'topics', 'note d.md'), '---\ntype: page\ntitle: 형제\n---\n\n# 형제\n')
      git(dir, ['add', '-A'])
      git(dir, ['commit', '-m', 'init bracket'])
      // 앱 밖에서 형제를 고쳤다 — 아직 커밋 전이다
      wf(
        join(dir, 'wiki', 'topics', 'note d.md'),
        '---\ntype: page\ntitle: 형제\n---\n\n# 형제\n\n밖에서 덧붙임\n'
      )
      const read = WikiService.read(dir, 'wiki/topics/note [d].md')!
      const result = WikiService.write(
        dir,
        'wiki/topics/note [d].md',
        `${read.text}\n덧붙임\n`,
        read.hash
      )
      expect(result).toMatchObject({ ok: true })
      // 형제 변경은 edit: 커밋에 타지 않고 작업대에 남는다
      expect(git(dir, ['status', '--porcelain', '--', 'wiki/topics/note d.md'])).toContain('M')
      const files = git(dir, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n')
      expect(files).not.toContain('wiki/topics/note d.md')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('wiki/ 밖 프로젝트 문서도 저장하고 커밋 제목은 파일 이름이다', () => {
    const dir = newVault()
    md(join(dir, 'projects', 'cloud-voucher'), { recursive: true })
    wf(join(dir, 'projects', 'cloud-voucher', 'README.md'), '# 클라우드바우처\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-m', 'init docs'])

    const project = WikiService.read(dir, 'projects/cloud-voucher/README.md')!
    expect(
      WikiService.write(
        dir,
        'projects/cloud-voucher/README.md',
        `${project.text}\n다음 할 일: 회의록 정리\n`,
        project.hash
      ).ok
    ).toBe(true)
    expect(git(dir, ['log', '-1', '--format=%s']).trim()).toBe('edit: README')
  })

  it('generic 폴더는 기본 브랜치가 없어도(남의 repo) 파일만 저장한다', () => {
    const dir = mk(join(tmpdir(), 'wiki-write-generic-dev-'))
    try {
      wf(join(dir, 'Home.md'), '# 홈\n')
      git(dir, ['init', '-q', '-b', 'dev'])
      git(dir, ['add', '-A'])
      git(dir, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init'])
      const read = WikiService.read(dir, 'Home.md')!
      const result = WikiService.write(dir, 'Home.md', `${read.text}\n메모\n`, read.hash)
      expect(result).toMatchObject({ ok: true, commit: null, baseCommit: null })
      expect(rf(join(dir, 'Home.md')).toString('utf8')).toContain('메모')
      expect(git(dir, ['rev-list', '--count', 'HEAD']).trim()).toBe('1')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('generic 폴더는 커밋이 하나도 없어도 던지지 않고 저장한다', () => {
    const dir = mk(join(tmpdir(), 'wiki-write-generic-nocommit-'))
    try {
      wf(join(dir, 'Home.md'), '# 홈\n')
      git(dir, ['init', '-q', '-b', 'main'])
      const read = WikiService.read(dir, 'Home.md')!
      const result = WikiService.write(dir, 'Home.md', `${read.text}\n메모\n`, read.hash)
      expect(result).toMatchObject({ ok: true, commit: null, baseCommit: null })
      expect(rf(join(dir, 'Home.md')).toString('utf8')).toContain('메모')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('generic 폴더(git 있음)에서는 파일만 저장하고 커밋하지 않는다', () => {
    const dir = mk(join(tmpdir(), 'wiki-write-generic-'))
    try {
      wf(join(dir, 'Home.md'), '# 홈\n')
      git(dir, ['init', '-q', '-b', 'main'])
      git(dir, ['add', '-A'])
      git(dir, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init'])
      const read = WikiService.read(dir, 'Home.md')!
      const result = WikiService.write(dir, 'Home.md', `${read.text}\n메모 한 줄\n`, read.hash)
      expect(result).toMatchObject({ ok: true, commit: null, baseCommit: null })
      expect(rf(join(dir, 'Home.md')).toString('utf8')).toContain('메모 한 줄')
      expect(git(dir, ['rev-list', '--count', 'HEAD']).trim()).toBe('1')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('generic 폴더에서도 편집 중 바뀐 파일은 저장하지 않는다', () => {
    const dir = mk(join(tmpdir(), 'wiki-write-generic-stale-'))
    try {
      wf(join(dir, 'Home.md'), '# 홈\n')
      const read = WikiService.read(dir, 'Home.md')!
      wf(join(dir, 'Home.md'), '# 홈\n\n밖에서 바꿈\n')
      const result = WikiService.write(dir, 'Home.md', `${read.text}\n메모\n`, read.hash)
      expect(result.ok).toBe(false)
      expect(rf(join(dir, 'Home.md')).toString('utf8')).not.toContain('메모')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('CRLF 파일 저장 후 CRLF 유지', async () => {
    const dir = newVault()
    const rel = 'wiki/topics/ai.md'
    const read = WikiService.read(dir, rel)!
    wf(join(dir, rel), read.text)
    const r0 = WikiService.read(dir, rel)!
    const crlf = '---\r\ntype: page\r\n---\r\n\r\n# AI\r\n'
    const result = WikiService.write(dir, rel, crlf, r0.hash)
    expect(result.ok).toBe(true)
    expect(rf(join(dir, rel), 'utf8')).toBe(crlf)
    void sha
  })

  it('내용 동일 저장은 커밋 0', async () => {
    const dir = newVault()
    const rel = 'wiki/topics/ai.md'
    const read = WikiService.read(dir, rel)!
    const before = sha(dir)
    expect(WikiService.write(dir, rel, read.text, read.hash)).toMatchObject({ ok: true })
    expect(sha(dir)).toBe(before)
  })

  it('hash 불일치(외부 편집) 거절', async () => {
    const dir = newVault()
    const rel = 'wiki/topics/ai.md'
    const read = WikiService.read(dir, rel)!
    wf(join(dir, rel), read.text + '\n외부 편집\n')
    expect(WikiService.write(dir, rel, read.text + '\n내 편집\n', read.hash).ok).toBe(false)
  })

  // 어제의 작업 브랜치에 남아 있어도(팀 확인 중) 편집은 저장된다 — 받기가 그 자리에서 팀 최신을 합친다
  it('남아 있는 작업 브랜치에서도 저장한다', async () => {
    const dir = newVault()
    const rel = 'wiki/topics/ai.md'
    const read = WikiService.read(dir, rel)!
    execFileSync('git', ['checkout', '-q', '-b', 'docs/2026-09-16-plan'], { cwd: dir })
    const result = WikiService.write(dir, rel, read.text + '\n내 편집\n', read.hash)
    expect(result.ok).toBe(true)
    expect(
      execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()
    ).toBe('edit: ai')
    expect(
      execFileSync('git', ['branch', '--show-current'], { cwd: dir, encoding: 'utf8' }).trim()
    ).toBe('docs/2026-09-16-plan')
  })

  // 개인 노트는 git 이 무시한다 — 저장은 하되 커밋하지 않는다
  it('git 이 무시하는 파일은 커밋 없이 저장한다', () => {
    const dir = newVault()
    wf(join(dir, '.gitignore'), 'private/\n')
    git(dir, ['add', '.gitignore'])
    git(dir, ['commit', '-m', 'ignore private'])
    md(join(dir, 'private'), { recursive: true })
    const rel = 'private/2026-09-17.md'
    wf(join(dir, rel), '# 오늘\n')
    const read = WikiService.read(dir, rel)!
    const head = sha(dir)
    const result = WikiService.write(dir, rel, '# 오늘\n\n- [x] 끝\n', read.hash)
    expect(result).toMatchObject({ ok: true, commit: null })
    expect(rf(join(dir, rel), 'utf8')).toBe('# 오늘\n\n- [x] 끝\n')
    expect(sha(dir)).toBe(head)
  })

  it('git 기록이 없는 보관함에서도 커밋 없이 저장한다', () => {
    const dir = newVault()
    rmSync(join(dir, '.git'), { recursive: true, force: true })
    const rel = 'wiki/topics/ai.md'
    const read = WikiService.read(dir, rel)!
    const result = WikiService.write(dir, rel, read.text + '\n고침\n', read.hash)
    expect(result).toEqual({ ok: true, commit: null, baseCommit: null })
    expect(rf(join(dir, rel), 'utf8')).toContain('고침')
  })

  it('작업 브랜치 HEAD 거절', async () => {
    const dir = newVault()
    const rel = 'wiki/topics/ai.md'
    const read = WikiService.read(dir, rel)!
    execFileSync('git', ['checkout', '-b', 'app/ingest-2026-09-14'], { cwd: dir })
    expect(WikiService.write(dir, rel, read.text + 'x', read.hash).ok).toBe(false)
  })

  it('위키화 진행 중 거절 (editLock)', async () => {
    const dir = newVault()
    const rel = 'wiki/topics/ai.md'
    const read = WikiService.read(dir, rel)!
    const end = vaultActivity.begin('ingest', dir)
    expect(typeof end).toBe('function')
    expect(WikiService.write(dir, rel, read.text + 'x', read.hash).ok).toBe(false)
    ;(end as () => void)()
  })

  it('확정 진행 중 거절 (editLock)', async () => {
    const dir = newVault()
    const rel = 'wiki/topics/ai.md'
    const read = WikiService.read(dir, rel)!
    const end = vaultActivity.begin('finalize', dir)
    expect(typeof end).toBe('function')
    expect(WikiService.write(dir, rel, read.text + 'x', read.hash).ok).toBe(false)
    ;(end as () => void)()
  })

  it('볼트 lock 파일(다른 프로세스) 거절', async () => {
    const dir = newVault()
    const rel = 'wiki/topics/ai.md'
    const read = WikiService.read(dir, rel)!
    md(join(dir, '.locks'), { recursive: true })
    wf(join(dir, INGEST_LOCK), '')
    expect(WikiService.write(dir, rel, read.text + 'x', read.hash).ok).toBe(false)
    void existsSync
  })

  it('고르기를 기다리는 충돌이 있으면 파일을 쓰기 전에 거절한다 — 충돌 표식이 고른 것으로 올라가지 않는다', () => {
    const dir = newVault()
    const rel = 'wiki/topics/ai.md'
    const main = git(dir, ['branch', '--show-current']).trim()
    execFileSync('git', ['checkout', '-q', '-b', 'other'], { cwd: dir })
    wf(join(dir, rel), '# 저쪽\n')
    git(dir, ['commit', '-qam', 'other side'])
    execFileSync('git', ['checkout', '-q', main], { cwd: dir })
    wf(join(dir, rel), '# 이쪽\n')
    git(dir, ['commit', '-qam', 'this side'])
    expect(() => git(dir, ['merge', 'other'])).toThrow()
    const conflicted = rf(join(dir, rel), 'utf8')
    const read = WikiService.read(dir, rel)!

    const result = WikiService.write(dir, rel, read.text + '\n고침\n', read.hash)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('승인에서 고른')
    expect(rf(join(dir, rel), 'utf8')).toBe(conflicted)
    expect(git(dir, ['diff', '--name-only', '--diff-filter=U']).trim()).toBe(rel)
  })

  it('편집 중 삭제된 파일 거절', async () => {
    const dir = newVault()
    const rel = 'wiki/topics/ai.md'
    const read = WikiService.read(dir, rel)!
    rmSync(join(dir, rel))
    expect(WikiService.write(dir, rel, read.text + 'x', read.hash).ok).toBe(false)
  })

  it('wiki/ 밖 경로 거절', async () => {
    const dir = newVault()
    expect(WikiService.write(dir, 'Clippings/x.md', 'x', '0').ok).toBe(false)
    expect(WikiService.write(dir, '../x.md', 'x', '0').ok).toBe(false)
  })

  it('다른 파일이 staged여도 그 파일은 커밋에 안 들어간다', async () => {
    const dir = newVault()
    const rel = 'wiki/topics/ai.md'
    const read = WikiService.read(dir, rel)!
    const other = join(dir, 'wiki', 'other.md')
    wf(other, '다른 파일\n')
    git(dir, ['add', 'wiki/other.md'])
    const result = WikiService.write(dir, rel, read.text + '\n추가\n', read.hash)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const files = git(dir, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])
      .trim()
      .split('\n')
    expect(files).toEqual([rel])
    // staged 상태는 남아 있다
    expect(git(dir, ['status', '--porcelain'])).toContain('A  wiki/other.md')
  })
})

describe('WikiService.writeText', () => {
  const newVault = (): string => {
    const dir = mk(join(tmpdir(), 'wiki-writetext-'))
    createVault(dir, { skeleton: VAULT_SKELETON })
    md(join(dir, 'raw', 'code'), { recursive: true })
    wf(join(dir, 'raw', 'code', 'a.js'), 'const a = 1\n')
    git(dir, ['add', 'raw/code/a.js'])
    git(dir, ['commit', '-m', 'init code'])
    return dir
  }
  const sha = (text: string): string => createHash('sha256').update(text).digest('hex')

  it('저장 → edit: <파일이름> 커밋, 디스크에 반영', () => {
    const dir = newVault()
    const rel = 'raw/code/a.js'
    const disk = rf(join(dir, rel), 'utf8')
    const result = WikiService.writeText(dir, rel, 'const a = 2\n', sha(disk))
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(rf(join(dir, rel), 'utf8')).toBe('const a = 2\n')
    expect(git(dir, ['log', '-1', '--format=%s']).trim()).toBe('edit: a')
    expect(git(dir, ['status', '--porcelain']).trim()).toBe('')
  })

  it('md는 write 길로만 — 여기서 거절', () => {
    const dir = newVault()
    expect(WikiService.writeText(dir, 'wiki/INDEX.md', 'x', '0').ok).toBe(false)
  })

  it('글자가 아니면 거절한다', () => {
    const dir = newVault()
    md(join(dir, 'attachments'))
    wf(join(dir, 'attachments', 'a.png'), 'png')
    expect(WikiService.writeText(dir, 'attachments/a.png', 'x', '0').ok).toBe(false)
  })

  it('hash가 다르면 거절한다', () => {
    const dir = newVault()
    const rel = 'raw/code/a.js'
    const result = WikiService.writeText(dir, rel, 'const a = 2\n', '0'.repeat(64))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('바뀌었어요')
  })

  it('같은 글이면 커밋 없이 성공한다', () => {
    const dir = newVault()
    const rel = 'raw/code/a.js'
    const disk = rf(join(dir, rel), 'utf8')
    const before = git(dir, ['rev-parse', 'HEAD']).trim()
    const result = WikiService.writeText(dir, rel, disk, sha(disk))
    expect(result).toMatchObject({ ok: true, commit: null })
    expect(git(dir, ['rev-parse', 'HEAD']).trim()).toBe(before)
  })

  it('경로 밖은 거절한다', () => {
    const dir = newVault()
    expect(WikiService.writeText(dir, '../x.js', 'x', '0').ok).toBe(false)
  })
})

describe('WikiService.listDocs + searchPages', () => {
  it('wiki/ 밖 문서도 검색 입력에 들어간다 — 프로젝트·산출물·주간 문서', () => {
    mkdirSync(join(vault, 'projects', 'cloud-voucher', 'outputs'), { recursive: true })
    writeFileSync(
      join(vault, 'projects', 'cloud-voucher', 'README.md'),
      '# 클라우드바우처\n\nzqprojectbody 진행 상황\n'
    )
    writeFileSync(
      join(vault, 'projects', 'cloud-voucher', 'outputs', '2026-09-15-meeting.md'),
      '# 회의\n\nzqmeetingbody 회의록\n'
    )
    const rels = WikiService.listDocs(vault).map((d) => d.rel)
    expect(rels).toContain('projects/cloud-voucher/README.md')
    expect(rels).toContain('projects/cloud-voucher/outputs/2026-09-15-meeting.md')
    expect(searchPages(WikiService.listDocs(vault), 'zqmeetingbody', 20).length).toBe(1)
  })

  it('넓어진 검색이 위키 목록 채널을 건드리지 않는다 — 그래프·구조 점검이 먹는 모양 그대로', () => {
    const wikiRels = WikiService.list(vault).map((p) => p.rel)
    expect(wikiRels.every((rel) => rel.startsWith('wiki/'))).toBe(true)
    expect(wikiRels).not.toContain('projects/cloud-voucher/README.md')
    const [first] = WikiService.list(vault)
    expect(Object.keys(first!).sort()).toEqual(
      ['frontmatter', 'frontmatterError', 'links', 'mtimeMs', 'rel', 'size', 'slug', 'title'].sort()
    )
  })

  it('— test: 본문 캐시(mtime 키)로 스캔해 점수순 SearchHit[] — test: WikiService.listDocs', () => {
    writeFileSync(join(vault, 'wiki', 'topics', 'cache.md'), '# 캐시\n\n리서치 본문이다\n')
    const hits = searchPages(WikiService.listDocs(vault), '리서치', 20)
    const hit = hits.find((h) => h.rel === 'wiki/topics/cache.md')
    expect(hit).toBeDefined()
    expect(hit?.snippet).toContain('리서치')

    // 같은 질의 재호출 — 캐시 경로에서도 동일 결과
    expect(searchPages(WikiService.listDocs(vault), '리서치', 20)).toEqual(hits)
  })

  it('— test: 파일이 바뀌면 mtime 키로 본문을 다시 읽는다 — test: WikiService.listDocs', () => {
    const f = join(vault, 'wiki', 'topics', 'cache.md')
    // 한글 단일 글자 토큰 노이즈를 피하려고 라틴 마커로 캐시 무효화를 검증한다
    writeFileSync(f, '# 캐시\n\nzebraqxyz 리서치\n')
    expect(searchPages(WikiService.listDocs(vault), 'zebraqxyz', 20).length).toBe(1)
    writeFileSync(f, '# 캐시\n\nquxxelf 그라페프루트\n')
    const t = new Date()
    utimesSync(f, t, t) // mtime 갱신 보장
    expect(searchPages(WikiService.listDocs(vault), 'zebraqxyz', 20).length).toBe(0)
    expect(searchPages(WikiService.listDocs(vault), 'quxxelf', 20).length).toBe(1)
  })

  it('frontmatter 는 스니펫에 들어가지 않는다 — test: WikiService.listDocs', () => {
    writeFileSync(
      join(vault, 'wiki', 'topics', 'fm.md'),
      '---\ntitle: Fm Page\ntags: [alpha]\n---\n\nzzfmbody 로 시작하는 본문이다\n'
    )
    const hit = searchPages(WikiService.listDocs(vault), 'zzfmbody', 20).find(
      (h) => h.rel === 'wiki/topics/fm.md'
    )
    expect(hit?.snippet).toContain('zzfmbody')
    expect(hit?.snippet).not.toContain('---')
    expect(hit?.snippet).not.toContain('tags:')

    // 본문에 없는 질의의 폴백 스니펫(첫 80자)도 frontmatter 가 아니다
    const titleHit = searchPages(WikiService.listDocs(vault), 'Fm Page', 20).find(
      (h) => h.rel === 'wiki/topics/fm.md'
    )
    expect(titleHit).toBeDefined()
    expect(titleHit?.snippet).not.toContain('title:')

    // frontmatter 에만 있는 값(tags)은 본문 매칭 대상이 아니다
    expect(searchPages(WikiService.listDocs(vault), 'alpha', 20).map((h) => h.rel)).not.toContain(
      'wiki/topics/fm.md'
    )
  })

  it('— test: 빈 질의는 결과 0 — test: WikiService.listDocs', () => {
    expect(searchPages(WikiService.listDocs(vault), '   ', 20)).toEqual([])
  })
})

describe('WikiService.lint — test: wiki-service', () => {
  it('구조 결함을 돌려주고, 볼트 필수 폴더가 없으면 vault_verify는 unavailable', async () => {
    const lv = mkdtempSync(join(tmpdir(), 'wiki-lint-'))
    mkdirSync(join(lv, 'wiki'), { recursive: true })
    writeFileSync(join(lv, 'wiki', 'INDEX.md'), '# INDEX\n\n[[a]]\n')
    writeFileSync(join(lv, 'wiki', 'a.md'), '# A\n\n[[INDEX]] [[ghost]]\n')

    const report = await WikiService.lint(lv)
    expect(report.verify).toEqual({
      status: 'unavailable',
      reason: expect.stringContaining('자료 보관함 폴더가 아니에요')
    })
    expect(report.structure).toEqual([
      { kind: 'broken-link', rel: 'wiki/a.md', line: 3, target: 'ghost' }
    ])
  })
})

describe('WikiService.listGraphPages — test: wiki-service graph scope', () => {
  it('wiki/ 밖 문서까지 rel·slug·frontmatter·links로 담는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiki-graph-'))
    try {
      mkdirSync(join(dir, 'docs'), { recursive: true })
      mkdirSync(join(dir, 'raw'), { recursive: true })
      writeFileSync(join(dir, 'docs', 'a.md'), '---\ntype: topic\n---\n\n# A\n\n[[b]]\n')
      writeFileSync(join(dir, 'docs', 'b.md'), '# B\n')
      writeFileSync(join(dir, 'raw', 'dump.md'), '# dump\n')
      writeFileSync(join(dir, 'README.md'), '# home\n')
      const pages = WikiService.listGraphPages(dir)
      expect(pages.map((p) => p.rel)).toEqual(['docs/a.md', 'docs/b.md', 'README.md'])
      const a = pages.find((p) => p.rel === 'docs/a.md')!
      expect(a.slug).toBe('docs/a')
      expect(a.frontmatter).toEqual({ type: 'topic' })
      expect(a.links.map((l) => l.target)).toEqual(['b'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
