import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  ensurePurpose,
  migrateOnboardingPurpose,
  PURPOSE_REL,
  readPurpose,
  writePurpose
} from './purpose'
import { createVault } from './vault-service'

const gitOut = (dir: string, args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

/** 첫 질문 답을 담아 두는 설정 대역 */
const store = (
  value: string | undefined
): { value: string | undefined; get: () => string | undefined; clear: () => void } => {
  const box = {
    value,
    get: () => box.value,
    clear: () => {
      box.value = undefined
    }
  }
  return box
}

const tmp = (): string => mkdtempSync(join(tmpdir(), 'purpose-'))

describe('purpose', () => {
  it('없으면 기본 purpose.md를 만들고 true를 돌려준다', () => {
    const dir = tmp()
    try {
      expect(ensurePurpose(dir)).toBe(true)
      const content = readFileSync(join(dir, 'purpose.md'), 'utf8')
      expect(content).toContain('목표')
      expect(content).toContain('핵심 질문')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('이미 있으면 한 글자도 바꾸지 않고 false를 돌려준다', () => {
    const dir = tmp()
    try {
      writeFileSync(join(dir, 'purpose.md'), '내 방향\n')
      expect(ensurePurpose(dir)).toBe(false)
      expect(readFileSync(join(dir, 'purpose.md'), 'utf8')).toBe('내 방향\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('없는 vault에서 읽으면 빈 문자열로 폴백한다', () => {
    const dir = tmp()
    try {
      expect(existsSync(join(dir, 'purpose.md'))).toBe(false)
      expect(readPurpose(dir)).toBe('')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('onboarding purpose', () => {
  it('첫 질문 답을 purpose.md 목표에 적고 커밋해 보관함을 깨끗하게 둔다', () => {
    const dir = tmp()
    try {
      expect(createVault(dir).ok).toBe(true)
      expect(writePurpose(dir, '  회사 AWS 운영 지식을 모으고 싶어요 ')).toBe(true)
      expect(readPurpose(dir)).toContain('- 회사 AWS 운영 지식을 모으고 싶어요\n')
      expect(gitOut(dir, ['status', '--porcelain'])).toBe('')
      expect(gitOut(dir, ['log', '-1', '--format=%s', '--', PURPOSE_REL])).toMatch(/purpose/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('템플릿에서 받아 purpose.md 가 아직 커밋되지 않은 보관함에도 적고 커밋한다', () => {
    const dir = tmp()
    try {
      expect(createVault(dir).ok).toBe(true)
      execFileSync('git', ['rm', '-q', '--cached', PURPOSE_REL], { cwd: dir })
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'drop'], {
        cwd: dir
      })
      expect(gitOut(dir, ['status', '--porcelain'])).toBe(`?? ${PURPOSE_REL}`)

      expect(writePurpose(dir, '독서 기록')).toBe(true)
      expect(gitOut(dir, ['status', '--porcelain'])).toBe('')
      expect(gitOut(dir, ['ls-files', PURPOSE_REL])).toBe(PURPOSE_REL)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("답에 $& · $' 같은 글자가 있어도 그대로 적는다", () => {
    const dir = tmp()
    try {
      expect(createVault(dir).ok).toBe(true)
      expect(writePurpose(dir, "가격 $& 와 $' 비교")).toBe(true)
      expect(readPurpose(dir)).toContain("## 목표\n\n- 가격 $& 와 $' 비교\n\n## 핵심 질문")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('사람이 이미 고쳐 둔 purpose.md 는 덮지 않는다', () => {
    const dir = tmp()
    try {
      expect(createVault(dir).ok).toBe(true)
      writeFileSync(join(dir, PURPOSE_REL), '# 내 방향\n')
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'mine'], {
        cwd: dir
      })

      expect(writePurpose(dir, '다른 답')).toBe(true)
      expect(readPurpose(dir)).toBe('# 내 방향\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('보관함이 생기면 설정의 답을 옮기고 커밋이 끝난 뒤에만 설정에서 지운다', () => {
    const dir = tmp()
    try {
      expect(createVault(dir).ok).toBe(true)
      const answer = store('여행 계획')
      migrateOnboardingPurpose(dir, answer)
      expect(answer.value).toBeUndefined()
      expect(readPurpose(dir)).toContain('- 여행 계획')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('커밋하지 못하면 답은 설정에 남는다 — 다음 열기에서 다시 옮긴다', () => {
    const dir = tmp()
    try {
      // git 저장소가 아닌 폴더 — 커밋이 실패한다
      ensurePurpose(dir)
      const answer = store('여행 계획')
      migrateOnboardingPurpose(dir, answer)
      expect(answer.value).toBe('여행 계획')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('답이 없으면 아무것도 쓰지 않는다', () => {
    const dir = tmp()
    try {
      expect(createVault(dir).ok).toBe(true)
      const before = readPurpose(dir)
      migrateOnboardingPurpose(dir, store(undefined))
      expect(readPurpose(dir)).toBe(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
