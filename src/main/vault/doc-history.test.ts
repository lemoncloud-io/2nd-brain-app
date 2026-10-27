import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '../git'
import { setAppUser } from './app-identity'
import { docAt, docHistory } from './doc-history'

let dir: string

const commitAs = (name: string, email: string, message: string): string => {
  git(dir, ['add', '-A'])
  git(dir, ['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-qm', message])
  return git(dir, ['rev-parse', 'HEAD']).trim()
}

const write = (rel: string, text: string): void => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(join(dir, rel), text)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'doc-history-'))
  git(dir, ['init', '-q', '-b', 'main'])
})

afterEach(() => {
  setAppUser(null)
  rmSync(dir, { recursive: true, force: true })
})

describe('docHistory', () => {
  it('숨김 폴더에 있다가 옮겨 온 파일은 숨김 시절 버전의 글을 주지 않는다', () => {
    write('.secret/a.md', '숨긴 글\n')
    const hidden = commitAs('tak', 'tak@example.com', 'edit: hidden')
    mkdirSync(join(dir, 'wiki'))
    git(dir, ['mv', '.secret/a.md', 'wiki/a.md'])
    const moved = commitAs('tak', 'tak@example.com', 'edit: move')

    expect(docHistory(dir, 'wiki/a.md').versions.map((v) => v.rev)).toEqual([moved, hidden])
    expect(docAt(dir, 'wiki/a.md', moved)).toBe('숨긴 글\n')
    expect(docAt(dir, 'wiki/a.md', hidden)).toBeNull()
  })

  it('md 가 아닌 글자 파일(html)도 버전 목록과 그때 글을 준다', () => {
    write('outputs/report.html', '<p>처음</p>\n')
    const first = commitAs('2nd-brain', 'vault@2nd-brain.local', 'note: report')
    write('outputs/report.html', '<p>나중</p>\n')
    const last = commitAs('tak', 'tak@example.com', 'edit: report')

    const { versions, recorded } = docHistory(dir, 'outputs/report.html')
    expect(recorded).toBe(true)
    expect(versions.map((v) => [v.rev, v.kind])).toEqual([
      [last, 'person'],
      [first, 'ai']
    ])
    expect(docAt(dir, 'outputs/report.html', first)).toBe('<p>처음</p>\n')
  })

  it('이름이 바뀐 문서도 바뀌기 전 기록까지 새것부터 보이고, 그때 글을 읽는다', () => {
    write('wiki/old.md', '처음\n')
    const first = commitAs('2nd-brain', 'vault@2nd-brain.local', 'edit: old')
    git(dir, ['mv', 'wiki/old.md', 'wiki/new.md'])
    commitAs('2nd-brain', 'vault@2nd-brain.local', 'edit: new')
    write('wiki/new.md', '나중\n')
    const last = commitAs('2nd-brain', 'vault@2nd-brain.local', 'edit: new')

    const { versions } = docHistory(dir, 'wiki/new.md')
    expect(versions.map((v) => v.rev)).toEqual([last, expect.any(String), first])
    expect(versions[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(docAt(dir, 'wiki/new.md', first)).toBe('처음\n')
    expect(docAt(dir, 'wiki/new.md', last)).toBe('나중\n')
  })

  it('AI가 쓴 것·내가 고친 것·다른 사람이 고친 것·로그인 전 앱 이름을 가른다', () => {
    write('wiki/a.md', '1\n')
    const app = commitAs('2nd-brain', 'vault@2nd-brain.local', 'edit: a')
    // 위키화 — 작업 브랜치의 커밋은 사용자 전역 git 이름으로 남지만 AI 가 쓴 것이다
    git(dir, ['checkout', '-qb', 'app/ingest-2026-10-02'])
    write('wiki/a.md', '2\n')
    const ingest = commitAs('tak', 'tak@example.com', 'wiki: ingest 2026-10-02')
    git(dir, ['checkout', '-q', 'main'])
    git(dir, [
      'merge',
      '--no-ff',
      '-q',
      '-m',
      'merge: app/ingest-2026-10-02',
      'app/ingest-2026-10-02'
    ])
    write('wiki/a.md', '3\n')
    const note = commitAs('alice', '7+alice@users.noreply.github.com', 'note: a')
    write('wiki/a.md', '4\n')
    const mine = commitAs('alice', '7+alice@users.noreply.github.com', 'edit: a')
    write('wiki/a.md', '5\n')
    const bob = commitAs('bob', '9+bob@users.noreply.github.com', 'edit: a')

    setAppUser({ login: 'alice', id: 7 })
    const byRev = new Map(docHistory(dir, 'wiki/a.md').versions.map((v) => [v.rev, v]))
    expect(byRev.get(bob)).toMatchObject({ kind: 'person', author: 'bob' })
    expect(byRev.get(mine)?.kind).toBe('me')
    expect(byRev.get(note)?.kind).toBe('ai')
    expect(byRev.get(ingest)?.kind).toBe('ai')
    expect(byRev.get(app)?.kind).toBe('app')
    // 로그인하지 않았으면 누구 것인지 모른다 — "내가 고침" 으로 단정하지 않는다
    setAppUser(null)
    expect(docHistory(dir, 'wiki/a.md').versions.find((v) => v.rev === mine)?.kind).toBe('person')
  })

  it('예전 앱 이름(eureka-wiki·2nd-brain Desktop)으로 남은 커밋도 앱 것으로 가른다', () => {
    write('wiki/a.md', '1\n')
    const desktop = commitAs('2nd-brain Desktop', 'vault@2nd-brain.local', 'edit: a')
    write('wiki/a.md', '2\n')
    const eureka = commitAs('eureka-wiki', 'vault@2nd-brain.local', 'edit: a')
    write('wiki/a.md', '3\n')
    const other = commitAs('eureka-wiki', 'someone@example.com', 'edit: a')
    const byRev = new Map(docHistory(dir, 'wiki/a.md').versions.map((v) => [v.rev, v.kind]))
    expect(byRev.get(desktop)).toBe('app')
    expect(byRev.get(eureka)).toBe('app')
    expect(byRev.get(other)).toBe('person')
  })

  it('위키화 에이전트의 결과 커밋(feat:)은 작업 브랜치를 거치지 않았어도 AI가 쓴 것이다', () => {
    write('wiki/a.md', '1\n')
    const agent = commitAs('tak', 'tak@example.com', 'feat: ingest 1 clippings into wiki (a)')
    write('wiki/a.md', '2\n')
    const human = commitAs('tak', 'tak@example.com', 'fix typo')
    const byRev = new Map(docHistory(dir, 'wiki/a.md').versions.map((v) => [v.rev, v.kind]))
    expect(byRev.get(agent)).toBe('ai')
    expect(byRev.get(human)).toBe('person')
  })

  it('승인을 기다리는 작업 브랜치 위에서는 아직 합치지 않은 커밋도 AI가 쓴 것이다', () => {
    write('wiki/a.md', '1\n')
    commitAs('2nd-brain', 'vault@2nd-brain.local', 'edit: a')
    git(dir, ['checkout', '-qb', 'app/ingest-2026-10-02'])
    write('wiki/a.md', '2\n')
    const ingest = commitAs('tak', 'tak@example.com', 'wiki: ingest')
    expect(docHistory(dir, 'wiki/a.md').versions[0]).toMatchObject({ rev: ingest, kind: 'ai' })
  })

  it('기록이 없는 문서·git 이 없는 보관함은 빈 목록, 그 문서의 기록이 아닌 버전은 읽지 않는다', () => {
    write('wiki/a.md', '1\n')
    const a = commitAs('2nd-brain', 'vault@2nd-brain.local', 'edit: a')
    write('wiki/b.md', 'b\n')
    expect(docHistory(dir, 'wiki/b.md')).toMatchObject({ versions: [], recorded: true })
    expect(docAt(dir, 'wiki/b.md', a)).toBeNull()
    // git 이 무시하는 파일은 저장해도 기록이 생기지 않는다 — "아직 없음" 과 가른다
    writeFileSync(join(dir, '.gitignore'), 'private/\n')
    write('private/p.md', 'p\n')
    expect(docHistory(dir, 'private/p.md')).toMatchObject({ versions: [], recorded: false })
    expect(docAt(dir, 'wiki/a.md', 'HEAD')).toBeNull()
    expect(docAt(dir, 'wiki/a.md', `${a}:wiki/a.md`)).toBeNull()

    const plain = mkdtempSync(join(tmpdir(), 'doc-history-plain-'))
    try {
      writeFileSync(join(plain, 'a.md'), 'a\n')
      expect(docHistory(plain, 'a.md')).toMatchObject({ versions: [], recorded: false })
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })
})
