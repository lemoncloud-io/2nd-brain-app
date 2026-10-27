// 이미 쓰던 노트 폴더(Obsidian 보관함 등)를 그대로 두고 2nd-brain 보관함으로 쓴다.
// 있는 파일은 한 글자도 바꾸지 않는다: 뼈대는 없는 파일만 더하고, 노트는 사본을 위키화 대기함(Clippings)에 넣는다 —
// 위키화는 대기함의 사본을 raw/ 로 옮기므로 원래 노트는 끝까지 제자리에 남는다.
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { git } from '../git'
import { APP_EMAIL, APP_NAME, appIdentity } from './app-identity'
import { claimUniquePath } from '../clip/clip-service'
import { isFullVault, openVault, vaultKindOf, VAULT_SKELETON } from './vault-service'
import { ensurePurpose } from './purpose'
import { mainT } from '../i18n'

export type AdoptResult =
  { ok: true; queued: number; kept: string[] } | { ok: false; reason: string }

export type AdoptPreview = { add: string[]; kept: string[]; notes: number }

/**
 * 보관함으로 쓰기 전에 보여 줄 미리보기 — 파일을 하나도 쓰지 않는다.
 * 뼈대 중 없는 이름(`add`)과 그 사람 것이라 둘 이름(`kept`), 대기함에 들어갈 노트 수.
 */
export const adoptPreview = (
  dir: string,
  skeleton: string = VAULT_SKELETON
): AdoptPreview | null => {
  if (!existsSync(dir) || !existsSync(skeleton)) return null
  // 순수 판정으로 — openVault 는 Clippings 자가치유로 폴더를 쓸 수 있다
  if (vaultKindOf(dir) === 'full') return null
  const add: string[] = []
  const kept: string[] = []
  for (const rel of skeletonFiles(skeleton)) {
    ;(existsSync(join(dir, rel)) ? kept : add).push(rel)
  }
  return { add, kept, notes: adoptableNotes(dir).length }
}

/** 노트로 보지 않는 맨 위 폴더 — 양식·이미 대기 중인 것·원본 보관·앱 산출물 */
const NOT_NOTES = new Set(['templates', 'Clippings', 'raw', 'outputs', 'node_modules'])

/** 대기함에 사본으로 넣을 노트 — 보관함 상대 경로, 숨김 폴더(`.obsidian`·`.git`)는 뺀다 */
export const adoptableNotes = (dir: string): string[] => {
  const out: string[] = []
  const walk = (at: string, depth: number): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      if (depth === 0 && NOT_NOTES.has(entry.name)) continue
      const full = join(at, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (entry.isFile() && entry.name.endsWith('.md')) out.push(relative(dir, full))
    }
  }
  walk(dir, 0)
  // 맨 위 규칙 파일은 노트가 아니다(다른 도구가 둔 AGENTS.md·CLAUDE.md 포함)
  return out
    .filter((rel) => !['VAULT_RULES.md', 'AGENTS.md', 'CLAUDE.md', 'README.md'].includes(rel))
    .sort()
}

/** 뼈대의 파일 목록 — 뼈대 상대 경로 */
const skeletonFiles = (skeleton: string): string[] => {
  const out: string[] = []
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name)
      if (entry.isDirectory()) walk(full)
      else out.push(relative(skeleton, full))
    }
  }
  walk(skeleton)
  return out.sort()
}

// 번들에서 .gitkeep 이 빠지는 빈 필수 폴더 — vault-service 의 KEEP_DIRS 와 같다
const KEEP_DIRS = ['raw', 'Clippings', 'outputs/runs', 'wiki/topics']

/**
 * 폴더를 보관함으로 삼는다. 있는 파일은 건드리지 않는다 — 뼈대에서 이미 있는 이름은 그 사람 것을 두고(`kept`),
 * `.gitignore` 만 빠진 줄을 끝에 덧붙인다. git 이 없으면 새로 시작하고, 있으면 그 기록을 그대로 쓴다.
 * 실패하면 이번에 만든 것만 지운다.
 */
export const adoptVault = (dir: string, skeleton: string = VAULT_SKELETON): AdoptResult => {
  if (!existsSync(dir)) return { ok: false, reason: mainT().vaultMain.noFolder }
  if (isFullVault(openVault(dir))) return { ok: false, reason: mainT().vaultMain.alreadyVault }
  if (!existsSync(skeleton)) return { ok: false, reason: mainT().vaultMain.noSkeleton(skeleton) }

  const notes = adoptableNotes(dir)
  const created: string[] = []
  // 이번에 새로 만든 폴더 — 실패하면 만든 순서의 반대로 지운다
  const madeDirs: string[] = []
  const ensureDir = (rel: string): void => {
    const parts = rel.split(/[\\/]/).filter((part) => part !== '' && part !== '.')
    for (let i = 1; i <= parts.length; i += 1) {
      const at = join(dir, ...parts.slice(0, i))
      if (existsSync(at)) continue
      mkdirSync(at)
      madeDirs.push(at)
    }
  }
  const kept: string[] = []
  const hadGit = existsSync(join(dir, '.git'))
  let gitignore: string | null = null
  try {
    for (const rel of skeletonFiles(skeleton)) {
      const target = join(dir, rel)
      if (rel === '.gitignore' && existsSync(target)) {
        const have = readFileSync(target, 'utf8')
        const lines = new Set(have.split('\n').map((line) => line.trim()))
        const add = readFileSync(join(skeleton, rel), 'utf8')
          .split('\n')
          .filter((line) => line.trim() !== '' && !lines.has(line.trim()))
        if (add.length > 0) {
          gitignore = have
          appendFileSync(
            target,
            `${have.endsWith('\n') || have === '' ? '' : '\n'}${add.join('\n')}\n`
          )
        }
        continue
      }
      if (existsSync(target)) {
        kept.push(rel)
        continue
      }
      ensureDir(dirname(rel))
      copyFileSync(join(skeleton, rel), target)
      created.push(rel)
    }
    for (const keep of KEEP_DIRS) {
      const marker = join(keep, '.gitkeep')
      if (existsSync(join(dir, keep))) continue
      ensureDir(keep)
      writeFileSync(join(dir, marker), '')
      created.push(marker)
    }
    // 방향성 문서 — 스켈레톤에 없으므로 따로 보장한다. 있는 파일은 건드리지 않는다
    if (ensurePurpose(dir)) created.push('purpose.md')
    // 노트 사본을 대기함으로 — 이름이 겹치면 note-1.md 처럼 비켜 간다
    const clippings = join(dir, 'Clippings')
    for (const rel of notes) {
      const dest = claimUniquePath(clippings, basename(rel))
      copyFileSync(join(dir, rel), dest)
      created.push(relative(dir, dest))
    }

    if (!hadGit) {
      git(dir, ['init', '-b', 'main'])
      git(dir, ['config', 'user.name', APP_NAME])
      git(dir, ['config', 'user.email', APP_EMAIL])
      git(dir, ['add', '-A'])
      git(dir, [...appIdentity(), 'commit', '-q', '-m', 'chore: adopt vault'])
    } else {
      // 그 사람의 git 기록 — 앱이 더한 것만 담는다. 스테이지해 둔 다른 변경은 섞지 않는다
      const paths = [...created, ...(gitignore === null ? [] : ['.gitignore'])]
      git(dir, ['--literal-pathspecs', 'add', '--', ...paths])
      git(dir, [
        '--literal-pathspecs',
        ...appIdentity(),
        'commit',
        '-q',
        '-m',
        'chore: adopt vault',
        '--',
        ...paths
      ])
    }
  } catch (error) {
    console.error('adopting the folder as a vault failed', dir, error)
    for (const rel of created) rmSync(join(dir, rel), { force: true })
    for (const made of madeDirs.reverse()) rmSync(made, { recursive: true, force: true })
    if (gitignore !== null) writeFileSync(join(dir, '.gitignore'), gitignore)
    if (!hadGit) rmSync(join(dir, '.git'), { recursive: true, force: true })
    return {
      ok: false,
      reason: mainT().vaultMain.adoptFailed
    }
  }
  return { ok: true, queued: notes.length, kept }
}
