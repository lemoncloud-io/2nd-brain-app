import { spawn, type ChildProcess } from 'node:child_process'

/**
 * 자식과 그 하위 프로세스를 끝낸다. POSIX 에서는 자식이 detached(그룹 리더)로 떠 있어야 한다.
 * signal 은 POSIX 전용 — Windows 의 taskkill /F 는 언제나 강제 종료다.
 */
export const killGroup = (
  child: ChildProcess,
  platform: NodeJS.Platform = process.platform,
  signal: NodeJS.Signals = 'SIGTERM'
): void => {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
  if (platform === 'win32') {
    // Windows 에는 프로세스 그룹 신호가 없다 — taskkill /T 가 자식 트리(.cmd shim 이 띄운 node 포함)를 끝낸다
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    })
    return
  }
  try {
    // detached 로 띄워 그룹 리더다 — 음수 pid 로 CLI 가 띄운 하위 프로세스까지 끝낸다
    process.kill(-child.pid, signal)
  } catch {
    // 그룹이 이미 끝났다
  }
}
