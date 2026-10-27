import { useCallback, useRef, useState } from 'react'
import { CheckCircle2, FileDown, LoaderCircle, TriangleAlert } from 'lucide-react'
import { CLIP_FILE_TYPES, type AddResult } from '../../../shared/ipc-contract'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { cn } from '../lib/utils'
import { toUserError } from '../lib/user-error'
import { useWorkbench } from '../store/workbench'
import { getT, useT } from '../lib/i18n'

// 절대 경로 대신 파일 이름만 — 저장 위치(Clippings/)는 사용자가 알 필요가 없다
const clippingName = (path: string): string => path.split('/').at(-1) ?? path

/** 파일 놓기 + URL 붙여넣기 */
export const ClipInputs = (): React.JSX.Element => {
  const t = useT()
  const openChat = useWorkbench((s) => s.openChat)
  const [url, setUrl] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)
  const [results, setResults] = useState<{ name: string; result: AddResult }[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [adding, setAdding] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  // 놓기·고르기가 겹치면 늦게 끝난 쪽이 먼저 결과를 지운다 — 렌더 전 두 번 놓기도 막는다
  const addingRef = useRef(false)

  const show = useCallback((next: { name: string; result: AddResult }[]): void => {
    setResults(next)
  }, [])

  // 여러 파일을 한 번에 — 하나씩 넣고 파일마다 결과를 보인다(PDF 글자 뽑기가 몇 초 걸릴 수 있다)
  const addFiles = async (files: File[]): Promise<void> => {
    if (files.length === 0 || addingRef.current) return
    addingRef.current = true
    setAdding(true)
    const next: { name: string; result: AddResult }[] = []
    try {
      for (const file of files) {
        const result = await window.api
          .clipFile(window.api.filePathForFile(file))
          .catch((error: unknown): AddResult => ({
            ok: false,
            reason: toUserError(error, getT().sources.clip.failed).text
          }))
        next.push({ name: file.name, result })
      }
    } finally {
      addingRef.current = false
      setAdding(false)
      show(next)
    }
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    void addFiles([...e.dataTransfer.files])
  }

  // 주소 보내기 — 단추와 Enter(폼 제출)가 같은 길이다
  const submitUrl = useCallback((): void => {
    // 앞뒤 공백은 버튼만 켠다 — 보낼 때는 뗀다. 끝날 때까지 한 번만 나간다
    const trimmed = url.trim()
    if (trimmed === '' || urlBusy) return
    setUrlBusy(true)
    window.api
      .clipUrl(trimmed)
      .then((result) => show([{ name: trimmed, result }]))
      .catch((error: unknown) =>
        show([
          {
            name: trimmed,
            result: { ok: false, reason: toUserError(error, getT().sources.clip.failed).text }
          }
        ])
      )
      .finally(() => setUrlBusy(false))
  }, [url, urlBusy, show])

  return (
    <>
      <div
        data-testid="clip-drop"
        role="button"
        tabIndex={0}
        aria-label={t.sources.clip.dropLabel}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          picker.current?.click()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'tactile flex h-44 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-callout',
          dragOver
            ? 'border-primary bg-primary/10 text-foreground'
            : 'border-muted-foreground/40 bg-well text-muted-foreground'
        )}
      >
        {adding ? (
          <LoaderCircle className="size-6 animate-spin" aria-hidden />
        ) : (
          <FileDown className="size-6" aria-hidden />
        )}
        <span role={adding ? 'status' : undefined}>
          {adding ? t.sources.clip.adding : t.sources.clip.drop}
        </span>
        {/* 종류는 사람 말로 — ".md·.txt" 같은 확장자 나열은 개발자 말이다 */}
        <span className="text-caption">{t.sources.clip.types}</span>
        <span className="text-caption">{t.sources.clip.keyboard}</span>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          data-testid="clip-pick"
          disabled={adding}
          onClick={() => picker.current?.click()}
        >
          {t.sources.clip.pick}
        </Button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          accept={CLIP_FILE_TYPES.join(',')}
          data-testid="clip-picker"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void addFiles(files)
          }}
        />
      </div>
      <form
        data-testid="clip-url-form"
        className="flex flex-col gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          submitUrl()
        }}
      >
        <div className="flex gap-2">
          <Input
            data-testid="clip-url"
            aria-label={t.sources.clip.urlLabel}
            placeholder={t.sources.clip.urlPlaceholder}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button
            variant="outline"
            type="submit"
            data-testid="clip-url-button"
            disabled={url.trim() === '' || urlBusy}
          >
            {urlBusy ? t.sources.clip.fetching : t.sources.clip.fetch}
          </Button>
        </div>
        {url.trim() === '' && !urlBusy && (
          <p className="text-caption text-muted-foreground">{t.sources.clip.urlHint}</p>
        )}
      </form>
      {results.length > 0 && (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          {/* live 영역은 글 목록만 — 옆의 단추까지 넣으면 단추 이름까지 읽는다 */}
          <div role="status" className="flex min-w-0 flex-1 flex-col gap-1">
            <ul className="flex min-w-0 flex-1 flex-col gap-1">
              {results.map(({ name, result }, index) => (
                <li
                  key={index}
                  data-testid="clip-result"
                  className={cn(
                    'flex min-w-0 items-start gap-1.5 wrap-anywhere text-callout',
                    result.ok ? 'text-label' : 'text-destructive'
                  )}
                >
                  {result.ok ? (
                    <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  )}
                  <span className="min-w-0">
                    {result.ok
                      ? t.sources.clip.added(clippingName(result.path))
                      : `${name} — ${toUserError(result.reason, t.sources.clip.failed).text}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 gap-2">
            {results.some(({ result }) => result.ok) && (
              <Button
                size="sm"
                variant="outline"
                data-testid="clip-go-ingest"
                onClick={() => openChat('ingest', { focus: true })}
              >
                {t.sources.goIngest}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              data-testid="clip-results-clear"
              onClick={() => setResults([])}
            >
              {t.sources.clip.clearResults}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

/** 넣기 칸 — 자료 구역이 제목과 순서를 쥐고, 여기는 끌어다 놓기·파일 고르기·주소만 그린다 */
export function ClipSection(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <ClipInputs />
    </div>
  )
}
