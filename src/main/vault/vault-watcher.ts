// 볼트 재귀 감시 — 디바운스로 변경 경로를 묶어 푸시한다(슬라이스 04).
// .git·.locks 변경은 무시. hold 중에는 적립만 하고 release()에 1회 보낸다 —
// 위키화가 파일을 수십 번 쓰는 동안 트리가 깜빡이지 않게.
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { basename, join } from 'node:path'

export interface VaultWatcher {
  stop: () => void
  release: () => void
}

export interface WatchVaultOptions {
  debounceMs?: number
  onChange: (rels: string[]) => void
  onError: () => void
  isHeld?: () => boolean
}

const IGNORED = /(^|[/\\])(\.git|\.locks)([/\\]|$)/

/**
 * 커밋이 남기는 유일한 흔적 — 커밋은 워킹트리 파일을 건드리지 않으므로, 이 줄이 늘어나는 것
 * 말고는 감시자에게 아무 일도 일어나지 않는다. 트리의 변경 배지는 git 이 보는 상태라서
 * `save:`·`note:`·`edit:` 커밋과 팀 변경 머지가 배지를 낡게 만든다(사용자 보고 2026-09-21).
 * `.git/index` 가 아니라 이 파일인 이유는 되읽기 때문이다 — 배지를 다시 묻는 `git status` 가
 * 인덱스를 갱신하면 그것이 다시 이벤트가 되어 스스로를 부르는 고리가 된다. 이 줄은 커밋·머지·
 * 체크아웃만 늘린다
 */
const GIT_COMMIT_LOG = /(^|[/\\])\.git[/\\]logs[/\\]HEAD$/

export const watchVault = (dir: string, opts: WatchVaultOptions): VaultWatcher => {
  const debounceMs = opts.debounceMs ?? 300
  let pending = new Set<string>()
  /** 이번 묶음에 커밋이 섞였나 — 그러면 보관함 전체를 다시 보라고 한다 */
  let committed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let heldFlush: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const rel = (abs: string): string =>
    abs
      .slice(dir.length + 1)
      .split('\\')
      .join('/')

  const flush = (): void => {
    timer = null
    if (pending.size === 0 && !committed) return
    if (opts.isHeld?.()) {
      // hold 중 — 적립해 둔 채로 주기적으로 재시도(활동이 끝나면 보낸다)
      if (!heldFlush) {
        heldFlush = setTimeout(() => {
          heldFlush = null
          flush()
        }, debounceMs)
      }
      return
    }
    // 커밋은 어느 파일이 달라 보이는지 말해 주지 않는다 — 빈 묶음은 "전부 다시 보라" 다
    const rels = committed ? [] : [...pending]
    pending = new Set()
    committed = false
    opts.onChange(rels)
  }

  const schedule = (abs: string): void => {
    if (IGNORED.test(abs)) {
      if (!GIT_COMMIT_LOG.test(abs)) return
      committed = true
    } else {
      pending.add(rel(abs))
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, debounceMs)
  }

  let watcher: FSWatcher | null = null
  try {
    watcher = watch(dir, { recursive: true }, (_event, filename) => {
      if (stopped) return
      // 루트 자체 이벤트(이동·삭제) — 사라졌으면 error로 보고한다
      if (!filename || !existsSync(dir)) {
        stopped = true
        watcher?.close()
        opts.onError()
        return
      }
      // FSEvents 는 감시 루트 자신의 이벤트를 루트 이름으로 흘린다 — 안에 그런 항목이 없으면 루트 이벤트다
      if (filename === basename(dir) && !existsSync(join(dir, filename))) return
      schedule(join(dir, filename))
    })
  } catch {
    // 이미 사라진 볼트 — onWatcherError로 보고한다
    opts.onError()
    return { stop: () => {}, release: () => {} }
  }
  // 리스너 없는 'error'는 main을 죽인다 — 반드시 잡는다
  watcher.on('error', () => {
    if (stopped) return
    stopped = true
    watcher?.close()
    opts.onError()
  })

  return {
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
      if (heldFlush) clearTimeout(heldFlush)
      watcher?.close()
    },
    release: () => {
      if (stopped) return
      flush()
    }
  }
}
