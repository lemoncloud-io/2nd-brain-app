// 그림 미리보기 — 맞춤(칸 너비까지만)·원본 크기·단계 확대·축소. 큰 그림은 바깥 미리보기 칸이 스크롤한다.
// 키(⌘= ⌘- ⌘0)·⌘+휠은 그림 자리가 초점을 가졌을 때만 듣는다 — 분할로 그림 둘을 띄워도 한쪽만 바뀐다.
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'
import { zoomLabel } from '../lib/file-preview-text'
import { stepZoom, zoomKey, type Zoom } from '../lib/image-zoom'
import { vaultUrl } from '../../../shared/vault-file-types'
import { useT } from '../lib/i18n'

const isMac = navigator.userAgent.includes('Mac')
// ⌘+휠 한 몸짓의 첫 이벤트는 곧바로 한 단계 — 마우스 한 칸(Mac 크롬은 40px 안팎)도 늘 움직인다.
// 트랙패드·매직 마우스의 쓸기는 작은 deltaY 수십 개(관성 포함)로 이어 오므로, 그 뒤는 모아서 이만큼마다 한 단계
const WHEEL_STEP_PX = 100
// 이만큼 쉬었다 오거나 방향이 바뀌면 새 몸짓이다
const WHEEL_IDLE_MS = 300

export const ImagePreview = ({ rel, alt }: { rel: string; alt: string }): React.JSX.Element => {
  const t = useT()
  const [zoom, setZoom] = useState<Zoom>('fit')
  // 그림의 원래 너비 — 불러온 뒤에야 안다. 배율 너비는 이것에 곱한다
  const [natural, setNatural] = useState(0)
  const areaRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const wheelRef = useRef({ sum: 0, at: -Infinity, dir: 0 })

  // 맞춤에서 출발하면 지금 그려진 배율이 기준이다
  const step = (dir: 1 | -1): void => {
    const img = imgRef.current
    // 맞춤 너비는 정수 px 라 단계 바로 아래(74.98)로 잴 수 있다 — 반올림해야 첫 누름이 눈에 보이게 바뀐다
    const shown =
      zoom !== 'fit'
        ? zoom
        : img && natural > 0
          ? Math.round((img.clientWidth / natural) * 100)
          : 100
    setZoom(stepZoom(shown, dir))
  }
  const onWheel = useEffectEvent((e: WheelEvent): void => {
    if (!(isMac ? e.metaKey : e.ctrlKey) || e.deltaY === 0) return
    e.preventDefault()
    const wheel = wheelRef.current
    const now = performance.now()
    const dir = Math.sign(e.deltaY)
    const fresh = now - wheel.at > WHEEL_IDLE_MS || dir !== wheel.dir
    wheel.at = now
    wheel.dir = dir
    wheel.sum = fresh ? 0 : wheel.sum + e.deltaY
    if (!fresh && Math.abs(wheel.sum) < WHEEL_STEP_PX) return
    wheel.sum = 0
    step(dir < 0 ? 1 : -1)
  })

  // 휠은 React onWheel 이 passive 라 기본 동작(스크롤)을 못 막는다 — 직접 단다
  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    area.addEventListener('wheel', onWheel, { passive: false })
    return () => area.removeEventListener('wheel', onWheel)
  }, [])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!(isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) || e.altKey) return
    const action = zoomKey(e.code)
    if (action === null) return
    e.preventDefault()
    if (action === 'fit') setZoom('fit')
    else step(action === 'in' ? 1 : -1)
  }

  return (
    <div
      ref={areaRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      // 넓힌 그림만큼 자리도 넓어야 가로로 밀어도 sticky 도구 줄이 남는다. 맞춤에서는 칸 너비 그대로 —
      // w-max 면 자리가 그림 원래 너비로 늘어 max-w-full 이 줄이지 못한다
      className={cn(
        'rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        zoom !== 'fit' && 'w-max min-w-full'
      )}
      data-testid="sources-image-area"
    >
      <div
        role="toolbar"
        aria-label={t.preview.zoomTools}
        title={t.preview.zoomTools}
        className="sticky top-0 left-0 z-10 flex w-fit items-center gap-1 rounded-br-md bg-background/90 px-4 py-2"
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t.preview.zoomOut}
          data-testid="image-zoom-out"
          onClick={() => step(-1)}
        >
          <Minus aria-hidden />
        </Button>
        <p
          className="min-w-12 text-center text-caption text-muted-foreground tabular-nums"
          aria-live="polite"
          data-testid="image-zoom-level"
        >
          {zoomLabel(zoom)}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t.preview.zoomIn}
          data-testid="image-zoom-in"
          onClick={() => step(1)}
        >
          <Plus aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-caption"
          aria-pressed={zoom === 'fit'}
          data-testid="image-zoom-fit"
          onClick={() => setZoom('fit')}
        >
          {t.preview.zoomFit}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-caption"
          aria-pressed={zoom === 100}
          data-testid="image-zoom-actual"
          onClick={() => setZoom(100)}
        >
          {t.preview.zoomActual}
        </Button>
      </div>
      <div className="px-6 pb-6">
        <img
          ref={imgRef}
          src={vaultUrl(rel)}
          alt={alt}
          onLoad={(e) => setNatural(e.currentTarget.naturalWidth)}
          className={zoom === 'fit' ? 'max-w-full' : 'max-w-none'}
          style={zoom === 'fit' || natural === 0 ? undefined : { width: (natural * zoom) / 100 }}
          data-testid="sources-image"
        />
      </div>
    </div>
  )
}
