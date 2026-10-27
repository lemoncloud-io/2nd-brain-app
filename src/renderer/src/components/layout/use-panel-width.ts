import { useEffect, useRef, useState } from 'react'

const KEY_STEP = 16

type PanelOptions = {
  storageKey: string
  minWidth: number
  /** 렌더·드래그 시점에 다시 읽는다 — 화면 비율 상한을 쓰는 패널이 있다 */
  maxWidth: () => number
  defaultWidth: number
  /** 드래그 핸들이 붙는 패널 가장자리 */
  edge: 'left' | 'right'
  /** 이 값이 바뀌면 상한을 다시 잰다 — 채팅 칸이 열리면 사이드바가 쓸 수 있는 자리가 줄어든다 */
  recheckKey?: string | number | boolean
}

export type PanelWidth = {
  width: number
  minWidth: number
  maxWidth: number
  edge: 'left' | 'right'
  startResize: (event: React.PointerEvent) => void
  resizeByKey: (event: React.KeyboardEvent) => void
}

export const usePanelWidth = ({
  storageKey,
  minWidth,
  maxWidth,
  defaultWidth,
  edge,
  recheckKey
}: PanelOptions): PanelWidth => {
  // 상한 계산식은 상대 패널 폭을 읽으므로 렌더마다 새 함수다. 효과의 의존성에 그대로 넣으면
  // 드래그 한 프레임마다 resize 리스너를 떼었다 붙인다 — 값은 ref 로 최신만 들고, 다시 재는
  // 시점은 recheckKey 가 정한다
  const maxWidthRef = useRef(maxWidth)
  useEffect(() => {
    maxWidthRef.current = maxWidth
  })
  const clamp = (width: number): number => Math.max(minWidth, Math.min(maxWidth(), width))
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(storageKey))
    return clamp(stored > 0 ? stored : defaultWidth)
  })
  const persist = (next: number): void => localStorage.setItem(storageKey, String(next))

  // 창이 좁아지면 상한도 같이 내려간다 — 다시 재지 않으면 패널이 옛 폭을 붙들어
  // 중앙 뷰가 자기 min-width 아래로 눌린다. 줄인 폭은 저장한다 — 다음 실행에 옛 폭이 돌아오면
  // 같은 눌림이 되풀이된다
  useEffect(() => {
    const onResize = (): void => {
      setWidth((current) => {
        const next = Math.max(minWidth, Math.min(maxWidthRef.current(), current))
        if (next !== current) localStorage.setItem(storageKey, String(next))
        return next
      })
    }
    // 창 크기만이 아니라 상대 패널이 열리고 닫혀도 남는 자리가 바뀐다 — 그때도 한 번 잰다
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [storageKey, minWidth, recheckKey])
  // 오른쪽 가장자리 핸들은 오른쪽으로 끌 때, 왼쪽 가장자리 핸들은 왼쪽으로 끌 때 넓어진다
  const grow = edge === 'right' ? 1 : -1

  const startResize = (event: React.PointerEvent): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    let latest = startWidth

    const onMove = (move: PointerEvent): void => {
      latest = clamp(startWidth + (move.clientX - startX) * grow)
      setWidth(latest)
    }
    // 저장은 놓을 때 한 번 — 드래그 중 매 프레임 쓰지 않는다
    const onUp = (): void => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      persist(latest)
    }

    document.body.style.cursor = 'col-resize'
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  const resizeByKey = (event: React.KeyboardEvent): void => {
    // 분리대 키보드 규약 — 위·아래도 좌·우와 같이, Home·End는 끝으로
    if (event.key === 'Home') {
      event.preventDefault()
      setWidth(minWidth)
      persist(minWidth)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      const max = maxWidth()
      setWidth(max)
      persist(max)
      return
    }
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (direction === 0) return
    event.preventDefault()
    const next = clamp(width + direction * grow * KEY_STEP)
    setWidth(next)
    persist(next)
  }

  return { width, minWidth, maxWidth: maxWidth(), edge, startResize, resizeByKey }
}
