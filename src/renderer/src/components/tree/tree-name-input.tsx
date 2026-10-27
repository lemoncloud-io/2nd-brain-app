// 이름 칸 — 이름 바꾸기와 새로 만들기가 같이 쓴다. Enter 면 그 이름으로, Esc·빈 이름이면 그만둔다.
import { useEffect, useRef } from 'react'

/**
 * 트리 키(화살표·Enter)가 가로채지 않게 막는다. "안 바뀌었으면 그만둔다" 는 여기서 정하지 않는다 —
 * 새로 만들 때는 기본 이름 그대로가 답이다.
 *
 * 초점을 잃었을 때는 둘이 갈린다. 이름 바꾸기는 이미 있는 항목이라 확정해도 잃을 것이 없지만,
 * 새로 만들기는 Enter 전에 디스크를 건드리면 안 된다 — 단추를 다시 누르기만 해도(Chromium 은
 * 단추 mousedown 에 초점을 준다) 치지도 않은 "새 폴더" 가 생겨 버린다. 그래서 만들 때는 취소다.
 */
export const NameInput = ({
  name,
  label,
  testId,
  blurConfirms,
  onDone
}: {
  name: string
  label: string
  testId: string
  /** 초점을 잃으면 그 이름으로 확정할까(이름 바꾸기) 그만둘까(새로 만들기) */
  blurConfirms: boolean
  onDone: (typed: string | null) => void
}): React.JSX.Element => {
  const done = useRef(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  // 오른쪽 클릭 메뉴에서 열리면 그 메뉴의 초점 가두기가 아직 살아 있어 autoFocus 가 먹지 않는다 —
  // 메뉴가 닫힌 다음 프레임에 한 번 더 잡는다
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!done.current && document.activeElement !== inputRef.current) inputRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [])
  const finish = (typed: string | null): void => {
    if (done.current) return
    done.current = true
    onDone(typed === null || typed.trim() === '' ? null : typed.trim())
  }
  return (
    <input
      ref={inputRef}
      autoFocus
      aria-label={label}
      data-testid={testId}
      defaultValue={name}
      spellCheck={false}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') finish(e.currentTarget.value)
        if (e.key === 'Escape') finish(null)
      }}
      onBlur={(e) => finish(blurConfirms ? e.currentTarget.value : null)}
      className="min-w-0 flex-1 rounded-sm border border-ring bg-background px-1 text-callout text-foreground outline-none"
    />
  )
}
