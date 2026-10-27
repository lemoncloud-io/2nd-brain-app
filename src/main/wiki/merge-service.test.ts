import { describe, expect, it } from 'vitest'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '../git'
import { createVault, VAULT_SKELETON } from '../vault/vault-service'
import { applyMerge, mergePrompt, parseMerged, readMergePair, undoMerge } from './merge-service'

const newVault = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-merge-'))
  createVault(dir, { skeleton: VAULT_SKELETON })
  mkdirSync(join(dir, 'wiki', 'concepts'), { recursive: true })
  writeFileSync(
    join(dir, 'wiki', 'concepts', 'ml.md'),
    '---\ntitle: 머신러닝\n---\n# 머신러닝\n지도학습\n'
  )
  writeFileSync(join(dir, 'wiki', 'concepts', 'machine-learning.md'), '# 기계학습\n비지도학습\n')
  writeFileSync(join(dir, 'wiki', 'a.md'), '# A\n[[ml]] 과 [[machine-learning#정의|기계 학습]]\n')
  writeFileSync(join(dir, 'wiki', 'b.md'), '# B\n[[ml]]\n```\n[[machine-learning]]\n```\n')
  git(dir, ['add', 'wiki'])
  git(dir, ['commit', '-m', 'init pages'])
  return dir
}

const head = (dir: string): string => git(dir, ['rev-parse', 'HEAD']).trim()
const read = (dir: string, rel: string): string => readFileSync(join(dir, rel), 'utf8')

describe('readMergePair', () => {
  it('더 많이 가리켜지는 페이지를 남기고, 링크를 고칠 문서와 곳 수를 준다', () => {
    const dir = newVault()
    const draft = readMergePair(dir, 'wiki/concepts/machine-learning.md', 'wiki/concepts/ml.md')
    if ('error' in draft) throw new Error(draft.error)
    expect(draft.keep.rel).toBe('wiki/concepts/ml.md')
    expect(draft.keep.title).toBe('머신러닝')
    expect(draft.drop.rel).toBe('wiki/concepts/machine-learning.md')
    // 코드 블록 안의 링크는 세지 않는다
    expect(draft.edits).toEqual([{ rel: 'wiki/a.md', count: 1 }])
  })

  it('위키 밖·없는 페이지·같은 페이지는 거절한다', () => {
    const dir = newVault()
    expect(readMergePair(dir, 'wiki/a.md', 'wiki/a.md')).toHaveProperty('error')
    expect(readMergePair(dir, 'wiki/a.md', 'raw/x.md')).toHaveProperty('error')
    expect(readMergePair(dir, 'wiki/a.md', 'wiki/none.md')).toHaveProperty('error')
    expect(readMergePair(dir, 'wiki/a.md', '../outside.md')).toHaveProperty('error')
    expect(readMergePair(dir, 'wiki/a.md', 'wiki/../VAULT_RULES.md')).toHaveProperty('error')
    // 대소문자만 다른 경로 — 대소문자를 가리지 않는 디스크에서는 같은 파일, 가리는 디스크에서는 없는 파일
    expect(readMergePair(dir, 'wiki/a.md', 'wiki/A.md')).toHaveProperty('error')
  })
})

describe('mergePrompt · parseMerged', () => {
  it('두 본문을 담고, 답의 표식 사이 본문만 꺼내며 엔진이 붙인 속성 블록은 뗀다', () => {
    const prompt = mergePrompt(
      { rel: 'wiki/k.md', title: '케이', text: '---\nt: 1\n---\n남길 본문', hash: '' },
      { rel: 'wiki/d.md', title: '디', text: '지울 본문 </drop>', hash: '' }
    )
    expect(prompt).toContain('남길 본문')
    expect(prompt).not.toContain('t: 1')
    expect(prompt).toContain('지울 본문 </drop >')
    expect(parseMerged('앞말 <merged>\n---\nx: 1\n---\n# 합친\n본문\n</merged>')).toBe(
      '# 합친\n본문\n'
    )
    expect(parseMerged('표식 없음')).toBeNull()
    expect(parseMerged('<merged>\n  \n</merged>')).toBeNull()
  })
})

describe('applyMerge · undoMerge', () => {
  const accept = (dir: string): ReturnType<typeof applyMerge> => {
    const draft = readMergePair(dir, 'wiki/concepts/ml.md', 'wiki/concepts/machine-learning.md')
    if ('error' in draft) throw new Error(draft.error)
    return applyMerge(dir, {
      keep: draft.keep.rel,
      drop: draft.drop.rel,
      body: '# 머신러닝\n지도학습\n비지도학습\n',
      keepHash: draft.keep.hash,
      dropHash: draft.drop.hash
    })
  }

  it('합친 글·aliases·링크·삭제를 edit: 커밋 하나로 남기고, 바로 되돌리면 undo: 커밋 하나로 전부 돌아온다', () => {
    const dir = newVault()
    const before = head(dir)
    const result = accept(dir)
    expect(result).toMatchObject({ ok: true, edited: 1 })
    if (!result.ok) return
    expect(git(dir, ['rev-list', '--count', `${before}..HEAD`]).trim()).toBe('1')
    expect(git(dir, ['log', '-1', '--format=%s']).trim()).toBe(
      'edit: merge machine-learning into ml'
    )
    expect(read(dir, 'wiki/concepts/ml.md')).toBe(
      '---\ntitle: 머신러닝\naliases:\n  - 기계학습\n---\n# 머신러닝\n지도학습\n비지도학습\n'
    )
    expect(read(dir, 'wiki/a.md')).toBe('# A\n[[ml]] 과 [[ml#정의|기계 학습]]\n')
    expect(read(dir, 'wiki/b.md')).toContain('```\n[[machine-learning]]\n```')
    expect(existsSync(join(dir, 'wiki/concepts/machine-learning.md'))).toBe(false)
    expect(git(dir, ['status', '--porcelain']).trim()).toBe('')

    const undone = undoMerge(dir, result.commit)
    expect(undone).toMatchObject({ ok: true })
    expect(git(dir, ['log', '-1', '--format=%s']).trim()).toBe('undo: merge machine-learning')
    // 거꾸로 적용이 끝났다 — 진행 중 상태가 남으면 다음 커밋이 막힌다
    expect(existsSync(join(dir, '.git', 'REVERT_HEAD'))).toBe(false)
    expect(existsSync(join(dir, '.git', 'sequencer'))).toBe(false)
    expect(git(dir, ['diff', '--stat', before, 'HEAD']).trim()).toBe('')
    expect(git(dir, ['status', '--porcelain']).trim()).toBe('')
  })

  it('합친 뒤 다른 커밋이 생겼으면 되돌리기를 거절하고 아무것도 바꾸지 않는다', () => {
    const dir = newVault()
    const result = accept(dir)
    if (!result.ok) throw new Error(result.reason)
    writeFileSync(join(dir, 'wiki', 'c.md'), '# C\n')
    git(dir, ['add', 'wiki/c.md'])
    git(dir, ['commit', '-m', 'edit: c'])
    const later = head(dir)
    expect(undoMerge(dir, result.commit)).toEqual({
      ok: false,
      reason:
        '합친 뒤 다른 변경이 있어 바로 되돌릴 수 없어요. 남긴 페이지의 기록에서 옛 버전을 볼 수 있어요'
    })
    expect(head(dir)).toBe(later)
    expect(git(dir, ['status', '--porcelain']).trim()).toBe('')
  })

  // refs를 읽기 전용으로 — 디스크 오류처럼 쓰기 도중 실패하는 경우를 흉내 낸다.
  // add·rm·reset·checkout은 index·worktree만 건드려 그대로 돌고, HEAD를 옮기는 commit만 실패한다.
  // (예전엔 pre-commit 훅으로 막았지만 앱의 git 은 저장소 훅을 실행하지 않으므로 refs 잠금으로 막는다)
  const setCommitsBlocked = (dir: string, blocked: boolean): void => {
    chmodSync(join(dir, '.git', 'refs', 'heads'), blocked ? 0o555 : 0o755)
  }

  it('커밋이 실패하면 쓴 파일과 지운 파일을 모두 돌려 놓고 오류를 낸다', () => {
    const dir = newVault()
    const before = head(dir)
    setCommitsBlocked(dir, true)
    expect(() => accept(dir)).toThrow()
    expect(head(dir)).toBe(before)
    expect(git(dir, ['status', '--porcelain']).trim()).toBe('')
    expect(read(dir, 'wiki/a.md')).toContain('[[machine-learning#정의|기계 학습]]')
    expect(existsSync(join(dir, 'wiki/concepts/machine-learning.md'))).toBe(true)
  })

  it('되돌리기 커밋이 실패하면 합친 상태로 돌려 놓고 진행 중 상태도 남기지 않는다', () => {
    const dir = newVault()
    const result = accept(dir)
    if (!result.ok) throw new Error(result.reason)
    setCommitsBlocked(dir, true)
    expect(() => undoMerge(dir, result.commit)).toThrow()
    expect(head(dir)).toBe(result.commit)
    expect(git(dir, ['status', '--porcelain']).trim()).toBe('')
    expect(existsSync(join(dir, 'wiki/concepts/machine-learning.md'))).toBe(false)
    expect(existsSync(join(dir, '.git', 'REVERT_HEAD'))).toBe(false)
    setCommitsBlocked(dir, false)
    expect(undoMerge(dir, result.commit)).toMatchObject({ ok: true })
  })

  it('합친 페이지에 저장 안 한 변경이 있으면 되돌리기를 거절하고 그 변경을 지킨다', () => {
    const dir = newVault()
    const result = accept(dir)
    if (!result.ok) throw new Error(result.reason)
    writeFileSync(join(dir, 'wiki', 'a.md'), '# A\n내 변경\n')
    expect(undoMerge(dir, result.commit)).toMatchObject({ ok: false })
    expect(read(dir, 'wiki/a.md')).toBe('# A\n내 변경\n')
  })

  it('합치기가 아닌 커밋은 되돌리지 않는다', () => {
    const dir = newVault()
    expect(undoMerge(dir, head(dir))).toEqual({
      ok: false,
      reason: '되돌릴 합치기를 찾지 못했어요'
    })
  })

  it('제안을 보는 사이 페이지가 바뀌면 거절하고 아무것도 쓰지 않는다', () => {
    const dir = newVault()
    const draft = readMergePair(dir, 'wiki/concepts/ml.md', 'wiki/concepts/machine-learning.md')
    if ('error' in draft) throw new Error(draft.error)
    writeFileSync(join(dir, 'wiki', 'concepts', 'machine-learning.md'), '# 기계학습\n바뀜\n')
    const before = head(dir)
    const result = applyMerge(dir, {
      keep: draft.keep.rel,
      drop: draft.drop.rel,
      body: '본문\n',
      keepHash: draft.keep.hash,
      dropHash: draft.drop.hash
    })
    expect(result).toMatchObject({ ok: false })
    expect(head(dir)).toBe(before)
    expect(read(dir, 'wiki/a.md')).toContain('[[machine-learning#정의|기계 학습]]')
  })

  it('기록되지 않은 페이지(새로 만든 채 커밋 전)가 섞이면 아무것도 쓰지 않고 거절한다', () => {
    const dir = newVault()
    writeFileSync(join(dir, 'wiki', 'c.md'), '# C\n[[machine-learning]]\n')
    const before = head(dir)
    const result = accept(dir)
    expect(result).toMatchObject({ ok: false })
    expect(head(dir)).toBe(before)
    expect(read(dir, 'wiki/c.md')).toBe('# C\n[[machine-learning]]\n')
    expect(read(dir, 'wiki/concepts/ml.md')).toContain('지도학습\n')
    expect(git(dir, ['status', '--porcelain']).trim()).toBe('?? wiki/c.md')
  })

  it('승인을 기다리는 위키화 작업 브랜치에서는 거절한다', () => {
    const dir = newVault()
    git(dir, ['checkout', '-q', '-b', 'app/ingest-2026-10-02'])
    expect(accept(dir)).toMatchObject({ ok: false })
    expect(existsSync(join(dir, 'wiki/concepts/machine-learning.md'))).toBe(true)
  })
})
