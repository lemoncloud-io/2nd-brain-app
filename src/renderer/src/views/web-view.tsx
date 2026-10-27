// 웹 탭 — 툴바와 페이지 자리. 페이지는 main 의 WebContentsView 가 이 자리 위에 네이티브로 뜬다:
// 여기서는 자리 사각형을 재어 알리고, 숨을 때(다른 탭·다른 뷰) 숨기라고 알릴 뿐 페이지를 그리지 않는다.
// 중앙 뷰는 한 번 마운트하고 숨기기만 하므로(App `VIEWS`) 이 컴포넌트 하나가 켜진 웹 탭을 따라간다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, RotateCw, X } from 'lucide-react'
import { ErrorNote } from '../components/error-note'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useWebOverlay } from '../hooks/use-web-overlay'
import { useWorkbench } from '../store/workbench'
import { normalizeWebAddress } from '../../../shared/web-address'
import { openExternal } from '../lib/open-external'
import { toUserError } from '../lib/user-error'
import type { AddResult } from '../../../shared/ipc-contract'
import { WEB_ADDRESS_ID, addressProblem, webErrorText } from '../lib/web-text'
import { useT } from '../lib/i18n'

export const WebView = (): React.JSX.Element => {
  const t = useT()
  const tabId = useWorkbench((s) => s.tabs[s.tabAt]?.id ?? null)
  const shown = useWorkbench((s) => s.view === 'web')
  const web = useWorkbench((s) => s.web)
  const setWebUrl = useWorkbench((s) => s.setWebUrl)
  const state = useWorkbench((s) => (tabId === null ? undefined : s.webStates[tabId]))
  const url = web?.url ?? null
  const error = state?.error ?? null
  // 자리 효과는 주소가 있나·실패했나만 본다 — 주소가 바뀔 때마다(페이지 안 이동 포함) 숨겼다 다시 띄우면 깜빡인다.
  // 실패하면 view 를 숨기고 그 자리에 실패 문구를 그린다(view 는 DOM 위에 떠서 문구를 덮는다)
  const placed = url !== null && error === null
  const [draft, setDraft] = useState(url ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const slot = useRef<HTMLDivElement>(null)
  const address = useRef<HTMLInputElement>(null)

  // 덮개 — 팔레트·확인 창·메뉴가 뜨면 view 가 그 위를 가린다. 지금 모습을 찍어 자리에 깔고 view 를 숨긴다.
  // 찍은 뒤에 숨긴다(숨긴 view 는 못 찍을 수 있다). 못 찍으면 빈 자리로 숨긴다
  const cover = useWebOverlay(shown && placed)
  const [shot, setShot] = useState<{ cover: number; tabId: string; src: string | null } | null>(
    null
  )
  const covered = cover !== 0 && shot?.cover === cover && shot.tabId === tabId
  useEffect(() => {
    if (cover === 0 || tabId === null) return
    let live = true
    void window.api
      .webCapture(tabId)
      .catch(() => null)
      .then((src) => {
        if (live) setShot({ cover, tabId, src })
      })
    return () => {
      live = false
    }
  }, [cover, tabId])

  // 탭을 옮기거나 페이지가 이동하면 주소칸을 그 주소로 — 치는 중인 글은 Enter 전까지 그대로다.
  // 렌더 중에 맞춘다(효과에서 맞추면 한 번 낡은 주소로 그린 뒤 다시 그린다)
  const [shownFor, setShownFor] = useState(`${tabId}\0${url}`)
  if (shownFor !== `${tabId}\0${url}`) {
    setShownFor(`${tabId}\0${url}`)
    setDraft(url ?? '')
    setProblem(null)
  }

  // 주소를 아직 안 넣은 웹 탭은 주소칸부터
  useEffect(() => {
    if (shown && url === null) address.current?.focus()
  }, [shown, tabId, url])

  // 켜진 탭에 view 가 없으면 만든다 — 탭을 다시 펼 때도 같은 길이다(이미 있으면 main 이 그대로 둔다)
  useEffect(() => {
    if (shown && tabId !== null && url !== null) void window.api.webEnsure(tabId, url)
  }, [shown, tabId, url])

  // 자리 알리기 — 크기·위치가 바뀔 때마다. 숨거나 주소가 없으면 숨기라고 알린다
  useLayoutEffect(() => {
    if (tabId === null) return
    const el = slot.current
    if (!shown || !placed || covered || el === null) {
      void window.api.webSetBounds(tabId, null)
      return
    }
    const place = (): void => {
      const r = el.getBoundingClientRect()
      void window.api.webSetBounds(tabId, {
        x: Math.max(0, r.left),
        y: Math.max(0, r.top),
        width: Math.max(0, r.width),
        height: Math.max(0, r.height)
      })
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(el)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      void window.api.webSetBounds(tabId, null)
    }
  }, [shown, tabId, placed, covered])

  // 담기 — 탭마다 따로 센다(null = 담는 중). 결과는 담은 탭에만 보이고, 담는 동안 그 탭의 단추를 막는다
  const openFile = useWorkbench((s) => s.openFile)
  const [clips, setClips] = useState<Record<string, AddResult | null>>({})
  const clipHere = tabId !== null && tabId in clips ? { result: clips[tabId] } : null
  const clipPage = async (): Promise<void> => {
    if (tabId === null) return
    setClips((all) => ({ ...all, [tabId]: null }))
    const result = await window.api.webClip(tabId).catch((cause: unknown): AddResult => ({
      ok: false,
      reason: toUserError(cause, t.web.clipFailed).text
    }))
    setClips((all) => ({ ...all, [tabId]: result }))
  }
  // 담은 자료의 보관함 경로 — main 은 절대 경로를 준다. 담기는 늘 Clippings/ 바로 아래에 쓴다
  const clippedRel =
    clipHere?.result?.ok === true ? `Clippings/${clipHere.result.path.split(/[\\/]/).pop()}` : null

  const go = (): void => {
    if (tabId === null) return
    const result = normalizeWebAddress(draft)
    if (!result.ok) {
      setProblem(addressProblem(result))
      return
    }
    setProblem(null)
    setDraft(result.url)
    setWebUrl(result.url)
    void window.api.webNavigate(tabId, result.url)
  }

  return (
    <div
      id="web-panel"
      role="tabpanel"
      aria-label={web?.title || t.web.toolbar}
      className="flex min-h-0 flex-1 flex-col"
      data-testid="web-view"
    >
      <div
        role="toolbar"
        aria-label={t.web.toolbar}
        className="relative flex h-9 shrink-0 items-center gap-1 border-b border-hairline px-2"
      >
        <ToolButton
          testId="web-back"
          label={t.web.back}
          disabled={!state?.canGoBack}
          onClick={() => tabId !== null && void window.api.webBack(tabId)}
        >
          <ArrowLeft aria-hidden />
        </ToolButton>
        <ToolButton
          testId="web-forward"
          label={t.web.forward}
          disabled={!state?.canGoForward}
          onClick={() => tabId !== null && void window.api.webForward(tabId)}
        >
          <ArrowRight aria-hidden />
        </ToolButton>
        {state?.loading ? (
          <ToolButton
            testId="web-stop"
            label={t.web.stop}
            onClick={() => tabId !== null && void window.api.webStop(tabId)}
          >
            <X aria-hidden />
          </ToolButton>
        ) : (
          <ToolButton
            testId="web-reload"
            label={t.web.reload}
            disabled={url === null}
            onClick={() => tabId !== null && void window.api.webReload(tabId)}
          >
            <RotateCw aria-hidden />
          </ToolButton>
        )}
        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            go()
          }}
        >
          <Input
            ref={address}
            id={WEB_ADDRESS_ID}
            data-testid="web-address"
            aria-label={t.web.address}
            placeholder={t.web.addressPlaceholder}
            value={draft}
            spellCheck={false}
            autoComplete="off"
            className="h-7"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Esc 는 주소를 되돌린다 — 브라우저 주소창과 같다
              if (e.key === 'Escape') {
                setDraft(url ?? '')
                setProblem(null)
              }
            }}
          />
        </form>
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0"
          data-testid="web-clip"
          title={t.web.clipHint}
          disabled={
            !placed || state?.loading !== false || (clipHere !== null && clipHere.result === null)
          }
          onClick={() => void clipPage()}
        >
          {clipHere !== null && clipHere.result === null ? t.web.clipping : t.web.clip}
        </Button>
        <ToolButton
          testId="web-open-outside"
          label={t.web.openOutside}
          disabled={url === null}
          onClick={() => url !== null && openExternal(state?.url || url, { external: true })}
        >
          <ExternalLink aria-hidden />
        </ToolButton>
        {state?.loading && (
          <span
            role="progressbar"
            aria-label={t.web.loading}
            data-testid="web-progress"
            className="bg-primary absolute inset-x-0 -bottom-px h-0.5 animate-pulse"
          />
        )}
      </div>
      {clippedRel !== null && (
        <p
          role="status"
          data-testid="web-clip-note"
          className="flex items-center gap-1 px-3 py-1 text-caption text-muted-foreground"
        >
          {t.web.clipped} ·
          <Button
            variant="link"
            className="h-auto p-0 text-caption"
            data-testid="web-clip-open"
            onClick={() => openFile(clippedRel, true)}
          >
            {t.web.openClipped}
          </Button>
        </p>
      )}
      {clipHere?.result?.ok === false && (
        <ErrorNote
          error={toUserError(clipHere.result.reason, t.web.clipFailed)}
          testId="web-clip-error"
          className="px-3 py-1"
        />
      )}
      {problem !== null && (
        <p
          role="alert"
          data-testid="web-address-problem"
          className="px-3 py-1 text-caption text-destructive"
        >
          {problem}
        </p>
      )}
      <div ref={slot} data-testid="web-slot" className="relative min-h-0 flex-1">
        {covered && shot.src !== null && (
          <img
            src={shot.src}
            alt=""
            data-testid="web-cover"
            className="pointer-events-none absolute inset-0 size-full"
          />
        )}
        {url === null && (
          <p className="flex h-full items-center justify-center text-callout text-muted-foreground">
            {t.web.empty}
          </p>
        )}
        {error !== null && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
            <ErrorNote
              error={webErrorText(error, state?.url ?? '')}
              testId="web-error"
              className="max-w-md text-center"
            />
            <Button
              variant="outline"
              size="sm"
              data-testid="web-retry"
              onClick={() => tabId !== null && void window.api.webReload(tabId)}
            >
              {t.web.retry}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

const ToolButton = ({
  testId,
  label,
  disabled,
  onClick,
  children
}: {
  testId: string
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element => (
  <Button
    variant="ghost"
    size="icon"
    className="size-7 shrink-0"
    data-testid={testId}
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </Button>
)
