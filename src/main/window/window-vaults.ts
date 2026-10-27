// 창↔보관함 바인딩 — electron 없이 도는 순수 매핑. 전송 껍질(sendToVault)은 ipc/broadcast.ts.
import { basename, dirname } from 'node:path'

/** 창(webContents id)이 지금 보고 있는 보관함 */
export class VaultBindings {
  private bound = new Map<number, string>()

  bind(id: number, dir: string): void {
    this.bound.set(id, dir)
  }

  unbind(id: number): void {
    this.bound.delete(id)
  }

  dirFor(id: number): string | null {
    return this.bound.get(id) ?? null
  }

  idsFor(dir: string): number[] {
    return [...this.bound.entries()].filter(([, bound]) => bound === dir).map(([id]) => id)
  }

  dirs(): string[] {
    return [...new Set(this.bound.values())]
  }
}

/** 앱 하나에 하나 — 핸들러·감시자·전송이 같은 바인딩을 본다 */
export const bindings = new VaultBindings()

/** 파괴된 창을 뺀 전송 대상 — sender 가 던지는 경우와 파괴된 창을 여기서 건너뛴다 */
export type WindowRef = { id: number; destroyed: boolean }

export const resolveTargets = (
  boundIds: readonly number[],
  windows: readonly WindowRef[]
): number[] => {
  const bound = new Set(boundIds)
  return windows.filter((w) => !w.destroyed && bound.has(w.id)).map((w) => w.id)
}

/** 열린 보관함인가 — 묶인 창이 있거나 전역 설정과 같으면 맞다 */
export const isVaultShown = (dir: string, openDirs: string[], globalDir: string | null): boolean =>
  openDirs.includes(dir) || globalDir === dir

/** vault:// 탐색 순서 — 앞에 있는 창, 전역, 나머지 묶인 창 순으로 중복 없이 */
export const orderedVaultDirs = (
  focused: string | null,
  globalDir: string | null,
  openDirs: string[]
): string[] => {
  const ordered: string[] = []
  for (const dir of [focused, globalDir, ...openDirs]) {
    if (dir && !ordered.includes(dir)) ordered.push(dir)
  }
  return ordered
}

/** 창 제목 — 같은 폴더명이 두 개 열리면 부모를 덧붙여 구분한다. 대소문자는 가리지 않는다 */
export const vaultTitle = (openDirs: string[], dir: string): string => {
  const base = basename(dir)
  const clash = openDirs.some(
    (other) => other !== dir && basename(other).toLowerCase() === base.toLowerCase()
  )
  if (!clash) return base
  return `${base} — ${basename(dirname(dir))}`
}
