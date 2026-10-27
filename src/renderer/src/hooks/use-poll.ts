import { useEffect } from 'react'

/**
 * active 인 동안 intervalMs 마다 tick 을 부른다. limitMs 가 지나면 멈추고 onLimit 을 한 번 부른다 —
 * 설치·로그인을 기다리는 화면이 사용자가 떠나 있어도 CLI 를 끝없이 띄우지 않게, 그리고 멈춘 것을
 * 화면이 알 수 있게. active 가 꺼졌다 켜지면 처음부터 다시 잰다.
 */
export const usePoll = (
  active: boolean,
  tick: () => void,
  { intervalMs, limitMs }: { intervalMs: number; limitMs: number },
  onLimit?: () => void
): void => {
  useEffect(() => {
    if (!active) return
    const started = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - started > limitMs) {
        clearInterval(timer)
        onLimit?.()
        return
      }
      tick()
    }, intervalMs)
    return () => clearInterval(timer)
  }, [active, tick, intervalMs, limitMs, onLimit])
}
