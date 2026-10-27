// 앱 업데이트 상태 구독 + "다시 시작하면 새 버전". 설정 칸과 사이드바 버튼이 같이 쓴다.
import { useEffect, useRef, useState } from 'react'
import type { UpdateState } from '../../../shared/ipc-contract'
import { useWorkbench } from '../store/workbench'

const checkFailed = (error: unknown): UpdateState => ({
  kind: 'failed',
  during: 'check',
  detail: error instanceof Error ? error.message : String(error)
})

export const useUpdate = (): {
  state: UpdateState | null
  restarting: boolean
  restart: () => void
  check: () => void
} => {
  const [state, setState] = useState<UpdateState | null>(null)
  const [restarting, setRestarting] = useState(false)
  // 두 번 누름은 렌더 사이에 온다 — state 로는 막지 못해 ref 로 막는다
  const busy = useRef(false)
  const settle = (): void => {
    busy.current = false
    setRestarting(false)
  }

  useEffect(() => {
    let alive = true
    window.api
      .getUpdateState()
      .then((s) => alive && setState(s))
      // 못 읽으면 "불러오는 중" 에 멈추지 않고 확인 실패로 보인다 — "다시 확인" 이 할 일이 된다
      .catch((error: unknown) => {
        console.error(error)
        if (alive) setState(checkFailed(error))
      })
    const off = window.api.onUpdateChanged((next) => {
      setState(next)
      // 설치가 실패해 준비가 풀리면 버튼을 다시 살린다
      if (next.kind !== 'ready') settle()
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  // 저장 안 한 편집이 있으면 먼저 묻는다("계속 편집 / 버리기"). 버리기를 고르면 편집 표시가 풀려
  // 앱을 닫을 때의 beforeunload 확인(App.tsx)이 다시 막지 않는다 — 막으면 설치가 멈춘다
  const restart = (): void => {
    if (busy.current) return
    useWorkbench.getState().leaveEditor(() => {
      if (busy.current) return
      busy.current = true
      setRestarting(true)
      window.api
        .installUpdate()
        .then((started) => {
          // 준비가 풀렸다(설치 실패 등) — 상태 푸시가 사유를 보인다. 버튼은 다시 누를 수 있게 둔다
          if (!started) settle()
        })
        .catch((error: unknown) => {
          console.error(error)
          settle()
        })
    })
  }

  // 결과는 상태 푸시로 온다 — 여기서 기다릴 것이 없다
  const check = (): void =>
    void window.api.checkUpdate().catch((error: unknown) => {
      console.error(error)
      setState(checkFailed(error))
    })

  return { state, restarting, restart, check }
}
