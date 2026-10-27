// 볼트 계약(필수 폴더)과 git 조작의 단일 출처.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { git } from '../git'
import { APP_EMAIL, APP_NAME, appIdentity } from './app-identity'
import { vaultKitPath } from '../paths'
import { ensurePurpose } from './purpose'
import type { VaultTemplate } from '../../shared/vault-templates'
import { applyVaultTemplate, findVaultTemplate, templateSkeletonProblem } from './vault-templates'
import { mainT } from '../i18n'

export const VAULT_SKELETON =
  process.env.VAULT_SKELETON_DIR ?? vaultKitPath('projects/2nd-brain-app/vault-skeleton')

// vault_verify.py EXPECTED_DIRS와 일치시킨다
export const REQUIRED_ENTRIES = [
  'VAULT_RULES.md',
  'wiki',
  'wiki/INDEX.md',
  'raw',
  'Clippings',
  'templates'
]

// 뼈대 원본(vault-skeleton)에서 .gitkeep 으로만 유지되는 빈 폴더
const KEEP_DIRS = ['raw', 'Clippings', 'outputs/runs', 'wiki/topics']

export type CreateResult = { ok: true } | { ok: false; reason: string }
/** full = 2nd-brain 뼈대 보관함, generic = Obsidian任意 폴더(읽기 중심). kind 없으면 full 취급 */
export type VaultKind = 'full' | 'generic'
export type OpenResult = { ok: true; kind?: VaultKind } | { ok: false; missing: string[] }

const isEmptyDir = (dir: string): boolean => existsSync(dir) && readdirSync(dir).length === 0

export const NEW_VAULT_NAME = '2nd-brain'

/** 첫 실행 보관함을 둘 곳 — 배포본은 문서 폴더. 시험은 `SECOND_BRAIN_VAULT_PARENT` 로 덮는다(진짜 문서 폴더에 쓰지 않게) */
export const defaultVaultParent = (documents: string): string =>
  process.env['SECOND_BRAIN_VAULT_PARENT'] ?? documents

/**
 * 고른 폴더가 비었으면 그대로, 아니면 그 안에 새 볼트 폴더(`2nd-brain`, `2nd-brain-2`…)를 쓴다.
 * 비개발자는 문서 폴더 같은 곳을 고른다 — "빈 폴더만" 으로 거절하면 거기서 멈춘다.
 */
export const newVaultDir = (picked: string, opts: { inside?: boolean } = {}): string => {
  // inside = 고른 곳이 아니라 둘 곳이다(첫 실행의 문서 폴더) — 비어 있어도 그 폴더 자체를 보관함으로 삼지 않는다
  if (!opts.inside && isEmptyDir(picked)) return picked
  for (let n = 1; ; n += 1) {
    const candidate = join(picked, n === 1 ? NEW_VAULT_NAME : `${NEW_VAULT_NAME}-${n}`)
    if (!existsSync(candidate)) {
      mkdirSync(candidate)
      return candidate
    }
    if (isEmptyDir(candidate)) return candidate
  }
}

const seedVault = (dir: string, skeleton: string, template: VaultTemplate | undefined): void => {
  cpSync(skeleton, dir, { recursive: true })
  // electron-builder 는 패키징에서 .gitkeep 을 뺀다(app-builder-lib fileMatcher excludedNames) —
  // .gitkeep 만 있던 빈 필수 폴더는 번들에서 사라지므로 여기서 다시 만든다
  for (const keep of KEEP_DIRS) {
    mkdirSync(join(dir, keep), { recursive: true })
    const marker = join(dir, keep, '.gitkeep')
    if (!existsSync(marker)) writeFileSync(marker, '')
  }
  // 방향성 문서 — 스켈레톤에 없어도 첫 커밋에 들어가게 여기서 만든다
  ensurePurpose(dir)
  if (template) applyVaultTemplate(dir, template)

  git(dir, ['init', '-b', 'main'])
  git(dir, ['add', '-A'])
  git(dir, [...appIdentity(), 'commit', '-m', 'chore: create vault'])
  // 전역 user가 있는 환경에서도 앱 기본값이 우선하지 않게 로컬 config로 기록 — 위키화 에이전트의 커밋이 이 이름을 쓴다
  git(dir, ['config', 'user.name', APP_NAME])
  git(dir, ['config', 'user.email', APP_EMAIL])
}

// 빈 폴더만 허용. 뼈대 복사 → (템플릿 시드) → git init -b main → 첫 커밋.
export const createVault = (
  dir: string,
  opts: { env?: NodeJS.ProcessEnv; skeleton?: string; template?: string } = {}
): CreateResult => {
  if (!existsSync(dir)) return { ok: false, reason: mainT().vaultMain.noFolderAt(dir) }
  if (!isEmptyDir(dir)) return { ok: false, reason: mainT().vaultMain.emptyOnly }
  const skeleton = opts.skeleton ?? VAULT_SKELETON
  if (!existsSync(skeleton)) return { ok: false, reason: mainT().vaultMain.noSkeleton(skeleton) }
  // 모르는 템플릿은 폴더에 아무것도 쓰기 전에 거절한다
  const template = opts.template === undefined ? undefined : findVaultTemplate(opts.template)
  if (opts.template !== undefined && !template) {
    return { ok: false, reason: mainT().vaultMain.unknownTemplate(opts.template) }
  }
  if (template) {
    const problem = templateSkeletonProblem(skeleton)
    if (problem) return { ok: false, reason: problem }
  }

  try {
    seedVault(dir, skeleton, template)
  } catch (error) {
    // 반쯤 만든 볼트를 남기면 "빈 폴더만" 규칙에 걸려 같은 폴더로 다시 못 만든다 — 처음처럼 비운다
    for (const entry of readdirSync(dir)) rmSync(join(dir, entry), { recursive: true, force: true })
    console.error('vault creation failed', dir, error)
    return {
      ok: false,
      reason: mainT().vaultMain.seedFailed
    }
  }
  return { ok: true }
}

// 필수 항목 검증. full이면 ok+full, 뼈대가 없어도 존재하는 디렉토리면 ok+generic(무쓰기)으로 연다.
// generic 분기에서는 사용자 파일을 절대 쓰지 않는다 — Clippings 자가치유도 full 전용이다.
// 존재하지 않거나 디렉토리가 아니면 누락 목록으로 거절한다.
// Clippings/ 는 앱이 쓰는 입력함이다 — git 은 빈 폴더를 저장하지 않아 클리핑을 다 처리한 볼트를 클론하면 없다.
// 그것만 빠졌으면 만들어 연다. 다른 항목이 빠진 폴더는 generic으로 연다.
export const openVault = (dir: string): OpenResult => {
  try {
    if (!statSync(dir).isDirectory()) return { ok: false, missing: [...REQUIRED_ENTRIES] }
  } catch {
    return { ok: false, missing: [...REQUIRED_ENTRIES] }
  }
  const missing = REQUIRED_ENTRIES.filter((entry) => !existsSync(join(dir, entry)))
  if (missing.length === 1 && missing[0] === 'Clippings') {
    mkdirSync(join(dir, 'Clippings'))
    return { ok: true, kind: 'full' }
  }
  if (missing.length > 0) return { ok: true, kind: 'generic' }
  // 구 full 볼트에는 purpose.md가 없다 — full에서만 기본값으로 만든다 (generic은 무쓰기)
  try {
    ensurePurpose(dir)
  } catch {
    // 조용히 계속 — ingest는 빈 컨텍스트로 돈다
  }
  return { ok: true, kind: 'full' }
}

/** 순수 판정 — 파일 쓰기 없음. 가드(write·prepare·동기)가 부작용 없이 부른다 */
export const vaultKindOf = (dir: string): VaultKind | null => {
  try {
    if (!statSync(dir).isDirectory()) return null
  } catch {
    return null
  }
  const missing = REQUIRED_ENTRIES.filter((entry) => !existsSync(join(dir, entry)))
  if (missing.length === 0) return 'full'
  if (missing.length === 1 && missing[0] === 'Clippings') return 'full'
  return 'generic'
}

/** full 보관함이 맞는지 — kind 없으면(openVault 구 판정) full 취급 */
export const isFullVault = (result: OpenResult): boolean =>
  result.ok && (result.kind ?? 'full') === 'full'

/** 뼈대 전제 기능의 단일 거절 문구 — 순수 판정이라 가드에서 부작용 없이 부른다. null이면 full */
export const requireFullVault = (dir: string): string | null =>
  vaultKindOf(dir) === 'full' ? null : mainT().vaultMain.readOnlyFolder
