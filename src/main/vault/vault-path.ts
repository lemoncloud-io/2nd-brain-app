import { realpathSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep, isAbsolute } from 'node:path'
import { fileKind, type VaultFileKind } from '../../shared/vault-file-types'

const DENIED_SEGMENTS = new Set(['.git', '.locks'])

/** 대상의 realpath. 없으면 존재하는 가장 가까운 조상의 realpath + 남은 꼬리, 조상도 없으면 null */
export const realpathOrNearest = (target: string): string | null => {
  const tail: string[] = []
  let current = target
  for (;;) {
    try {
      return join(realpathSync(current), ...tail)
    } catch {
      const parent = dirname(current)
      if (parent === current) return null
      tail.unshift(basename(current))
      current = parent
    }
  }
}

/**
 * 볼트 안 상대경로를 절대경로로 해석한다. 볼트 밖으로 나가는 모든 경로는 거절.
 * - 없는 파일은 존재하는 가장 가까운 조상의 realpath + 남은 꼬리 (생성 전 경로 검사용)
 * - `.git`·`.locks` 세그먼트는 realpath 뒤 볼트 기준 경로에서 소문자 비교로 거부
 *   (심볼릭 링크로 가리키는 경우 포함, APFS 대소문자 무시 대응)
 * - `realpath` 결과가 볼트 루트 realpath 접두 밖이면 거부 (심볼릭 링크 탈출)
 */
export function resolveInVault(vaultDir: string, rel: string): string | null {
  if (typeof rel !== 'string' || rel.length === 0) return null
  if (isAbsolute(rel)) return null

  // Windows 구분자 `\`는 허용하지 않는다 — POSIX에선 파일명으로 풀려 경로 검사를 우회할 수 있다
  if (rel.includes('\\')) return null
  const candidate = resolve(vaultDir, ...rel.split('/'))
  const real = realpathOrNearest(candidate)
  if (real === null) return null

  const rootReal = realpathSync(vaultDir)
  const prefix = rootReal.endsWith(sep) ? rootReal : rootReal + sep
  if (real !== rootReal && !real.startsWith(prefix)) return null
  const inside = relative(rootReal, real).split(sep)
  if (inside.some((segment) => DENIED_SEGMENTS.has(segment.toLowerCase()))) return null

  return candidate
}

/**
 * 기본 앱으로 열어도 되는 보관함 파일의 절대경로 — 종류는 링크가 아니라 실제 대상의 확장자로 본다.
 * `x.docx` 라는 심볼릭 링크가 보관함 안 실행 파일(`run.command`)을 가리키면 이름만 보고 열었다가 그것이 돈다
 */
export const openableInVault = (
  vaultDir: string,
  rel: string,
  kinds: readonly VaultFileKind[]
): string | null => {
  if (!kinds.includes(fileKind(rel))) return null
  const full = resolveInVault(vaultDir, rel)
  if (full === null) return null
  try {
    return kinds.includes(fileKind(realpathSync(full))) ? full : null
  } catch {
    return null
  }
}
