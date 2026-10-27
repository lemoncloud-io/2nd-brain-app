// 보관함별 감시자 — 같은 보관함은 하나로 공유하고, 아무도 안 보면 멈춘다.
// 만들기는 주입받는다 — 단위 테스트는 가짜 감시자를 꽂는다.
import { watchVault, type VaultWatcher, type WatchVaultOptions } from './vault-watcher'

export class VaultWatchers {
  private entries = new Map<string, { watcher: VaultWatcher; refs: number }>()

  constructor(
    private create: (dir: string, opts: WatchVaultOptions) => VaultWatcher = watchVault
  ) {}

  ensure(dir: string, opts: WatchVaultOptions): VaultWatcher {
    const existing = this.entries.get(dir)
    if (existing) {
      existing.refs += 1
      return existing.watcher
    }
    const watcher = this.create(dir, opts)
    this.entries.set(dir, { watcher, refs: 1 })
    return watcher
  }

  release(dir: string): void {
    const existing = this.entries.get(dir)
    if (!existing) return
    existing.refs -= 1
    if (existing.refs <= 0) {
      existing.watcher.stop()
      this.entries.delete(dir)
    }
  }

  refs(dir: string): number {
    return this.entries.get(dir)?.refs ?? 0
  }

  /** 지켜보는 보관함들 */
  dirs(): string[] {
    return [...this.entries.keys()]
  }

  /** 적립 flush 같은 직접 조작용 — 없으면 null */
  peek(dir: string): { watcher: VaultWatcher; refs: number } | null {
    return this.entries.get(dir) ?? null
  }

  /** 폴더 삭제·이동 — 참조 수와 상관없이 멈추고 잊는다 */
  drop(dir: string): void {
    const existing = this.entries.get(dir)
    if (!existing) return
    existing.watcher.stop()
    this.entries.delete(dir)
  }
}
