// 볼트 진행 상태의 단일 출처 — 위키화·확정·채팅·노트 쓰기·점검 활동과
// 클리핑·편집 가드, Activity 패널이 같은 값을 읽는다.
import { mainT } from '../i18n'
export type ActivityKind = 'ingest' | 'finalize' | 'chat' | 'note' | 'lint'

export type BeginResult = (() => void) | { busy: string }

export type VaultActivity = {
  /**
   * @param key 볼트 dir(ingest·finalize·note), 대화 id(chat), 볼트 dir(lint)
   */
  begin: (kind: ActivityKind, key: string) => BeginResult
  /** 보관함을 쓰는 활동(ingest·finalize·note) — 없으면 null */
  holder: (vaultDir: string) => ActivityKind | null
  /** 클리핑·watcher 가드 — 보관함을 쓰는 활동의 사유, 아니면 null */
  clipLock: (vaultDir: string) => string | null
  /** 편집 저장 가드 — 위키화·확정·노트 쓰기 진행 중 사유, 아니면 null */
  editLock: (vaultDir: string) => string | null
  onChange: (cb: () => void) => () => void
}

const BUSY: Partial<Record<ActivityKind, () => string>> = {
  ingest: () => mainT().vaultMain.busyIngest,
  finalize: () => mainT().vaultMain.busyFinalize,
  note: () => mainT().vaultMain.busyNote
}

export const createVaultActivity = (): VaultActivity => {
  // key → 활동 종류
  const active = new Map<string, ActivityKind>()
  const listeners = new Set<() => void>()

  const notify = (): void => {
    for (const cb of listeners) cb()
  }

  const running = (kind: ActivityKind): string | null => {
    for (const [key, value] of active) {
      if (value === kind) return key
    }
    return null
  }

  return {
    begin: (kind, key) => {
      // 보관함을 쓰는 활동(ingest·finalize·note)만 보관함 경로를 그대로 칸 이름으로 쓴다 —
      // lint 도 보관함 경로로 부르지만, 같은 칸에 들면 노트 쓰기 잠금을 덮어쓴다
      const slot = kind === 'chat' ? `chat:${key}` : kind === 'lint' ? `heavy:${key}` : key
      if (kind === 'chat') {
        // 채팅은 위키화 중에도 허용, 대화당 1개
        if (active.has(slot)) return { busy: mainT().vaultMain.busyChat }
      } else if (kind === 'lint') {
        // 무거운 작업 슬롯 1개 — 보관함이 달라도 점검은 한 번에 하나만 돈다
        if (running('lint') !== null) return { busy: mainT().vaultMain.busyLint }
      } else {
        // ingest·finalize·note는 볼트 단위로 서로 배타 — 노트 쓰기의 사후 판정이 위키화가 쓴 파일을 되돌리지 않게
        const current = active.get(slot)
        if (current) return { busy: BUSY[current]?.() ?? mainT().vaultMain.busyVault }
      }
      active.set(slot, kind)
      notify()
      let done = false
      return () => {
        if (done) return
        done = true
        if (active.get(slot) === kind) active.delete(slot)
        notify()
      }
    },
    holder: (vaultDir) => {
      const kind = active.get(vaultDir)
      return kind === 'ingest' || kind === 'finalize' || kind === 'note' ? kind : null
    },
    clipLock: (vaultDir) => {
      const kind = active.get(vaultDir)
      if (kind === 'ingest') return mainT().vaultMain.clipIngest
      if (kind === 'finalize') return mainT().vaultMain.clipFinalize
      if (kind === 'note') return mainT().vaultMain.clipNote
      return null
    },
    editLock: (vaultDir) => {
      const kind = active.get(vaultDir)
      if (kind === 'ingest') return mainT().vaultMain.editIngest
      if (kind === 'finalize') return mainT().vaultMain.editFinalize
      if (kind === 'note') return mainT().vaultMain.editNote
      return null
    },
    onChange: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    }
  }
}

// main 프로세스에서 하나만 쓴다
export const vaultActivity = createVaultActivity()
