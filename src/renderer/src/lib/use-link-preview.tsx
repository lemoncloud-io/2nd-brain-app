// 링크 호버 미리보기 — 위키 링크에 마우스를 잠시 올리면 그 페이지를 링크 곁에 띄운다(Obsidian Page preview).
// 링크마다 팝오버를 달지 않는다: 렌더러 하나(`lib/wikilink-markdown`)가 미리보기 칸 하나를 두고, 링크는 들어오고
// 나가는 것만 알린다 — 링크마다 팝오버를 붙이면 링크 수백 개짜리 페이지(INDEX)의 그리기가 링크 수만큼 무거워진다.
// 본문 렌더러는 부르는 쪽이 준다 — 여기서 WikilinkMarkdown 을 부르면 두 파일이 서로를 import 한다.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PreviewBody } from '../components/link-preview'

/** 올리고 이만큼 머물러야 뜬다 — 링크 위를 지나가기만 하는 마우스에 뜨지 않게 */
const OPEN_DELAY_MS = 400
/** 링크에서 미리보기로 마우스를 옮기는 사이 닫히지 않게 */
const CLOSE_DELAY_MS = 200
const GAP = 6
const EDGE = 12
const WIDTH = 416
const MAX_HEIGHT = 320

/** 링크 아래에, 아래 자리가 모자라면 위에. 좌우는 창 안으로 */
const placeNear = (anchor: DOMRect): React.CSSProperties => {
  const width = Math.min(WIDTH, window.innerWidth - EDGE * 2)
  const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - width - EDGE))
  const below = window.innerHeight - anchor.bottom - GAP - EDGE
  if (below >= MAX_HEIGHT || below >= anchor.top - GAP - EDGE)
    return { left, width, top: anchor.bottom + GAP }
  return { left, width, bottom: window.innerHeight - anchor.top + GAP }
}

/** 링크가 알리는 것 — 들어옴(초점 포함)·나감. 한 번 만들어 렌더 사이에 그대로다 */
export type LinkHover = {
  enter: (rel: string, anchor: HTMLElement) => void
  leave: () => void
}

type Shown = { rel: string; anchor: DOMRect }

/**
 * 미리보기 칸 하나와 그것을 여닫는 링크 쪽 손잡이. `popover` 는 렌더러 끝에 그대로 그린다(body 로 포털).
 * md 만 페이지로 읽는다 — 그림·PDF 링크에는 띄우지 않는다.
 */
export const useLinkPreview = (
  renderBody: (text: string) => ReactNode
): { hover: LinkHover; popover: ReactNode } => {
  const [shown, setShown] = useState<Shown | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const cardRef = useRef<HTMLDivElement>(null)

  const hover = useMemo((): LinkHover => {
    const later = (run: () => void, ms: number): void => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(run, ms)
    }
    return {
      enter: (rel, anchor) => {
        if (!rel.toLowerCase().endsWith('.md')) return
        later(() => setShown({ rel, anchor: anchor.getBoundingClientRect() }), OPEN_DELAY_MS)
      },
      leave: () => later(() => setShown(null), CLOSE_DELAY_MS)
    }
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // 떠 있는 동안 Esc 와 바깥 스크롤은 닫는다 — 칸은 링크 자리에 고정돼 있어 스크롤하면 링크와 떨어진다
  useEffect(() => {
    if (shown === null) return
    const close = (): void => {
      window.clearTimeout(timer.current)
      setShown(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    const onScroll = (e: Event): void => {
      if (!(e.target instanceof Node && cardRef.current?.contains(e.target))) close()
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [shown])

  const popover =
    shown === null
      ? null
      : createPortal(
          <div
            ref={cardRef}
            data-testid="link-preview"
            data-rel={shown.rel}
            style={placeNear(shown.anchor)}
            onPointerEnter={() => window.clearTimeout(timer.current)}
            onPointerLeave={hover.leave}
            // 안의 링크를 누르면 그 페이지로 가니 칸은 할 일을 다 했다
            onClick={(e) => {
              if (e.target instanceof Element && e.target.closest('a')) setShown(null)
            }}
            className="fixed z-50 max-h-80 overflow-y-auto rounded-lg border border-hairline bg-elevated p-4 shadow-overlay animate-in fade-in-0 duration-150 ease-tactile"
          >
            <PreviewBody key={shown.rel} rel={shown.rel} renderBody={renderBody} />
          </div>,
          document.body
        )

  return { hover, popover }
}
