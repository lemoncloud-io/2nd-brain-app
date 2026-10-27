// vault 방향성 문서 — 위키의 "왜". 스켈레톤·REQUIRED_ENTRIES는 건드리지 않는다
// (vault-kit는 외부 레포 고정 sha 동기화) — 없으면 코드가 기본값으로 만든다.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git } from '../git'
import { appIdentity } from './app-identity'

export const PURPOSE_REL = 'purpose.md'

// ui-hangul-ignore: 새 보관함에 쓰는 씨앗 본문 — 볼트 데이터(D8)
export const DEFAULT_PURPOSE = [
  '# 이 자료 보관함의 방향',
  '',
  '## 목표',
  '',
  '- (이 보관함으로 무엇을 이루고 싶은지 한 줄로 적어 주세요)',
  '',
  '## 핵심 질문',
  '',
  '- (위키가 답해야 할 질문을 적어 주세요)',
  '',
  '## 범위',
  '',
  '- (무엇을 모으고, 무엇을 모으지 않는지 적어 주세요)',
  ''
].join('\n')

/** 있으면 전문, 없으면 빈 문자열 — ingest는 빈 컨텍스트로 계속 간다 */
export const readPurpose = (vaultDir: string): string => {
  try {
    return readFileSync(join(vaultDir, PURPOSE_REL), 'utf8')
  } catch {
    return ''
  }
}

/** 없으면 기본값으로 만든다. 만들었으면 true, 이미 있었으면 false */
export const ensurePurpose = (vaultDir: string): boolean => {
  if (existsSync(join(vaultDir, PURPOSE_REL))) return false
  writeFileSync(join(vaultDir, PURPOSE_REL), DEFAULT_PURPOSE)
  return true
}

// ui-hangul-ignore: 씨앗 본문의 자리표시 줄을 알아보는 값(D8)
const GOAL_PLACEHOLDER = '- (이 보관함으로 무엇을 이루고 싶은지 한 줄로 적어 주세요)'

/**
 * 첫 질문 답을 목표에 적고 그 파일만 커밋한다 — 보관함을 깨끗하게 둔다. 사람이 이미 고친 purpose.md 는 덮지 않는다.
 * 옮길 것이 끝났으면 true, 쓰거나 커밋하지 못했으면 false(파일은 원래대로 되돌린다 — 다음 열기에서 다시 옮긴다)
 */
export const writePurpose = (vaultDir: string, answer: string): boolean => {
  const goal = answer.trim().replace(/\s+/g, ' ')
  if (goal === '') return true
  const file = join(vaultDir, PURPOSE_REL)
  const before = existsSync(file) ? readFileSync(file, 'utf8') : null
  if (before !== null && before !== DEFAULT_PURPOSE) return true
  try {
    writeFileSync(
      file,
      DEFAULT_PURPOSE.replace(GOAL_PLACEHOLDER, () => `- ${goal}`)
    )
    git(vaultDir, ['add', '--', PURPOSE_REL])
    git(vaultDir, [...appIdentity(), 'commit', '-m', 'chore: set vault purpose', '--', PURPOSE_REL])
    return true
  } catch (error) {
    console.error('could not write the first answer to purpose.md', vaultDir, error)
    try {
      if (before === null) rmSync(file, { force: true })
      else writeFileSync(file, before)
      git(vaultDir, ['reset', '-q', '--', PURPOSE_REL])
    } catch {
      // intentionally ignored: 되돌리기는 최선이다 — git 저장소가 아니면 reset 이 실패하고, 파일은 이미 원래대로다
    }
    return false
  }
}

/** 보관함이 생기기 전에 받아 둔 첫 질문 답(설정)을 보관함으로 옮긴다 — 커밋이 끝난 뒤에만 설정에서 지운다 */
export const migrateOnboardingPurpose = (
  vaultDir: string,
  answer: { get(): string | undefined; clear(): void }
): void => {
  const text = answer.get()
  if (text === undefined) return
  if (writePurpose(vaultDir, text)) answer.clear()
}
