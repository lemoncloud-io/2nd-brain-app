import { useEffect, useRef } from 'react'
import { useWorkbench } from '../store/workbench'

// 보관함을 다른 것으로 바꾼 때만 부른다. 파일 감시의 빈 묶음은 커밋·통째 바뀜에도 오므로
// 전환 신호로 쓰지 않는다 — 전환 판정은 store(vault-data) 의 vaultDir 한 곳이다.
// 처음 읽는 것(null → 경로)은 전환이 아니다.
export const useVaultSwitch = (onSwitch: () => void): void => {
  const vaultDir = useWorkbench((s) => s.vaultDir)
  const seen = useRef(vaultDir)
  const latest = useRef(onSwitch)
  useEffect(() => {
    latest.current = onSwitch
  })
  useEffect(() => {
    const was = seen.current
    seen.current = vaultDir
    if (was !== null && was !== vaultDir) latest.current()
  }, [vaultDir])
}
