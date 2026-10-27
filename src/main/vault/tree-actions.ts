// 파일 트리 도구 — 새 노트·새 폴더·이름 바꾸기·옮기기. 이름은 Obsidian 처럼 정해 두고 겹치면 번호를 붙인다.
// 커밋하지 않는다 — 추적 중인 문서가 바뀐 것은 팀 변경을 받기 전 `save:` 커밋이 담는다(sync-service).
// 지우기는 OS 휴지통으로 보낸다(electron shell) — 여기는 지워도 되는 항목인지만 가린다.
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileKind } from '../../shared/vault-file-types'
import { resolveInVault } from './vault-path'
import { isVaultFile } from './vault-scope'
import { mainT } from '../i18n'

export type TreeActionResult = { ok: true; rel: string } | { ok: false; reason: string }

/** 만들 자리 — 보관함 맨 위(`''`) 또는 숨김 밖의 있는 폴더 */
const folderIn = (vaultDir: string, folder: string): string | null => {
  if (folder === '') return vaultDir
  if (!isVaultFile(folder)) return null
  const full = resolveInVault(vaultDir, folder)
  if (full === null || !existsSync(full) || !statSync(full).isDirectory()) return null
  return full
}

const freeName = (dir: string, stem: string, ext: string): string => {
  for (let n = 1; ; n += 1) {
    const name = n === 1 ? `${stem}${ext}` : `${stem} ${n}${ext}`
    if (!existsSync(join(dir, name))) return name
  }
}

const relOf = (folder: string, name: string): string => (folder === '' ? name : `${folder}/${name}`)

/** 사람이 친 이름의 공통 규칙 — 경로 문자·숨김·빈 이름은 거절. 이름 바꾸기와 같은 잣대다 */
const validName = (typed: string): string | null => {
  const name = typed.trim()
  if (name === '' || name === '.' || name === '..' || name.startsWith('.')) return null
  if (/[/\\:*?"<>|]/.test(name)) return null
  return name
}

/**
 * 빈 파일로 만들어도 말이 되는 형식 — 글자로 채우는 것들만이다. 그림·소리·영상·PDF 는 0바이트로
 * 만들면 열자마자 깨진 미리보기가 되고 앱 안에는 채울 수단이 없다. `.base`·`.canvas` 도 빈 파일은
 * 제 리더가 못 읽는다
 */
const WRITABLE_KINDS = new Set(['markdown', 'text', 'json', 'html'])

/**
 * 친 이름의 확장자 — 글로 채우는 형식을 쳤으면 그대로 두고, 아니면 노트로 본다.
 * 아는 형식만 살리는 이유는 점이 든 제목 때문이다: `회의 2026.09.21` 의 `.21` 을 형식으로 받으면
 * 아무 데서도 안 열리는 파일이 남는다. `index.html`·`메모.txt` 는 그대로 그 형식으로 만들어진다
 */
const withNoteExt = (name: string): string =>
  WRITABLE_KINDS.has(fileKind(name)) ? name : `${name}.md`

/**
 * 만들 이름을 정한다. 트리가 이름을 받아 왔으면 그대로 쓰고(겹치면 거절 — 번호를 붙여 딴 이름으로
 * 만들면 사용자가 친 것과 다른 것이 생긴다), 안 받아 왔으면 예전처럼 기본 이름에 번호를 붙인다.
 */
const nameToMake = (
  dir: string,
  typed: string | undefined,
  stem: string,
  ext: string,
  fixExt: (name: string) => string
): { ok: false; reason: string } | { ok: true; name: string } => {
  if (typed === undefined) return { ok: true, name: freeName(dir, stem, ext) }
  const valid = validName(typed)
  if (valid === null) return { ok: false, reason: mainT().vaultMain.nameRule }
  const name = fixExt(valid)
  if (existsSync(join(dir, name))) return { ok: false, reason: mainT().vaultMain.nameTaken(name) }
  return { ok: true, name }
}

export const createNote = (vaultDir: string, folder: string, typed?: string): TreeActionResult => {
  const dir = folderIn(vaultDir, folder)
  if (dir === null) return { ok: false, reason: mainT().vaultMain.noNoteHere }
  const chosen = nameToMake(dir, typed, mainT().vaultMain.untitled, '.md', withNoteExt)
  if (!chosen.ok) return chosen
  // wx: 그 사이 같은 이름이 생겼으면 덮지 않고 실패한다
  writeFileSync(join(dir, chosen.name), '', { flag: 'wx' })
  return { ok: true, rel: relOf(folder, chosen.name) }
}

export const createFolder = (
  vaultDir: string,
  parent: string,
  typed?: string
): TreeActionResult => {
  const dir = folderIn(vaultDir, parent)
  if (dir === null) return { ok: false, reason: mainT().vaultMain.noFolderHere }
  const chosen = nameToMake(dir, typed, mainT().vaultMain.newFolder, '', (name) => name)
  if (!chosen.ok) return chosen
  mkdirSync(join(dir, chosen.name))
  return { ok: true, rel: relOf(parent, chosen.name) }
}

/**
 * 사람이 옮기거나 지울 수 없는 자리 — 보관함 뼈대(맨 위 폴더), 원본 보관(`raw/` 는 덧붙이기만 한다),
 * 볼트 계약 파일. 이 셋이 사라지면 위키화·Obsidian·다른 도구가 보관함을 못 읽는다.
 */
const CONTRACT_FILES = new Set(['VAULT_RULES.md', 'AGENTS.md', 'CLAUDE.md'])

/** 옮기기·이름 바꾸기·지우기 대상 — 보관함 안의 있는 항목이고 보호 자리가 아니면 절대경로 */
export const movableEntry = (
  vaultDir: string,
  rel: string
): { ok: true; full: string } | { ok: false; reason: string } => {
  if (!isVaultFile(rel)) return { ok: false, reason: mainT().vaultMain.entryInvalid }
  const full = resolveInVault(vaultDir, rel)
  if (full === null || !existsSync(full))
    return { ok: false, reason: mainT().vaultMain.entryMissing }
  const top = !rel.includes('/')
  if (rel === 'raw' || rel.startsWith('raw/')) {
    return { ok: false, reason: mainT().vaultMain.rawLocked }
  }
  if (top && statSync(full).isDirectory()) {
    return { ok: false, reason: mainT().vaultMain.topLocked }
  }
  if (top && CONTRACT_FILES.has(rel)) {
    return { ok: false, reason: mainT().vaultMain.rulesLocked }
  }
  return { ok: true, full }
}

/**
 * 사람이 친 새 이름 — 경로 문자·숨김·빈 이름은 거절.
 * `asTyped` 면 친 그대로다(폴더, 또는 화면이 확장자까지 보여 준 채 받은 이름).
 * 아니면 화면이 보여 준 것은 확장자를 뗀 이름이므로 원래 확장자를 도로 붙인다 —
 * 그러지 않으면 `2026-09-17` 로 고치는 순간 `.md` 가 사라진다
 */
const cleanName = (typed: string, oldName: string, asTyped: boolean): string | null => {
  const name = validName(typed)
  if (name === null || asTyped) return name
  const ext = extname(oldName)
  return ext !== '' && extname(name).toLowerCase() !== ext.toLowerCase() ? `${name}${ext}` : name
}

/** `nameHasExt` = 트리가 확장자까지 보여 주고 받은 이름 — 그때만 확장자를 바꿀 수 있다 */
export const renameEntry = (
  vaultDir: string,
  rel: string,
  typed: string,
  nameHasExt = false
): TreeActionResult => {
  const entry = movableEntry(vaultDir, rel)
  if (!entry.ok) return entry
  const oldName = rel.split('/').pop() ?? rel
  const name = cleanName(typed, oldName, nameHasExt || statSync(entry.full).isDirectory())
  if (name === null) return { ok: false, reason: mainT().vaultMain.nameRule }
  const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
  const next = relOf(folder, name)
  if (next === rel) return { ok: true, rel }
  // 대소문자만 바꾸는 이름은 macOS·Windows 에서 같은 파일이라 existsSync 가 참이다 — 그때는 막지 않는다
  const sameFile = next.toLowerCase() === rel.toLowerCase()
  if (!sameFile && existsSync(join(dirname(entry.full), name))) {
    return { ok: false, reason: mainT().vaultMain.nameTaken(name) }
  }
  renameSync(entry.full, join(dirname(entry.full), name))
  return { ok: true, rel: next }
}

export const moveEntry = (vaultDir: string, rel: string, toFolder: string): TreeActionResult => {
  const entry = movableEntry(vaultDir, rel)
  if (!entry.ok) return entry
  if (toFolder === 'raw' || toFolder.startsWith('raw/')) {
    return { ok: false, reason: mainT().vaultMain.noMoveIntoRaw }
  }
  const dir = folderIn(vaultDir, toFolder)
  if (dir === null) return { ok: false, reason: mainT().vaultMain.noMoveThere }
  if (toFolder === rel || toFolder.startsWith(`${rel}/`)) {
    return { ok: false, reason: mainT().vaultMain.noMoveIntoSelf }
  }
  const name = rel.split('/').pop() ?? rel
  const next = relOf(toFolder, name)
  if (next === rel) return { ok: true, rel }
  if (existsSync(join(dir, name))) return { ok: false, reason: mainT().vaultMain.moveTaken(name) }
  renameSync(entry.full, join(dir, name))
  return { ok: true, rel: next }
}
