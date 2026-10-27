// 경과 초 — 몇 분 걸리는 일(위키화·점검·합치기·받기)이 멈춘 것과 구분되게 센다.
// 켜져 있는 동안만 1초씩 는다. 탭이 안 보이면(document.hidden) 세지 않는다 —
// 안 보는 화면의 초침이 새벽에 혼자 돌아가 있지는 않게. 끄면 0으로 돌아가고,
// 다시 켜지면 0부터 — 멈췄다 이어지는 일도 처음부터 센다.
import { useEffect, useState } from 'react'

export const useElapsed = (active: boolean): number => {
  const [elapsed, setElapsed] = useState(0)
  // 켜짐·꺼짐이 바뀌면 0부터 — 이전 렌더 값 비교 후 렌더 중 조정(공식 "previous renders" 패턴)
  const [prevActive, setPrevActive] = useState(active)
  if (prevActive !== active) {
    setPrevActive(active)
    setElapsed(0)
  }
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => {
      if (document.hidden) return
      setElapsed((n) => n + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [active])
  return active ? elapsed : 0
}
