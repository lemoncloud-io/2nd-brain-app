// PDF 미리보기(슬라이스 06) — pdfjs-dist 캔버스 렌더. 워커는 로컬 번들(`?url` 임포트).
// legacy 빌드를 쓴다: 기본 빌드(6.3)는 Map/WeakMap.getOrInsertComputed 를 polyfill 없이 호출하는데
// Electron 39 렌더러에 없어 "getOrInsertComputed is not a function" 으로 깨진다. legacy 는 core-js polyfill 포함.
import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toUserError, type UserError } from '../lib/user-error'
import { ErrorNote } from '../components/error-note'
import { Button } from '../components/ui/button'
import { fileManagerName, usePlatform } from '../hooks/use-platform'
import { getT, useT } from '../lib/i18n'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export const PdfPreview = ({ rel }: { rel: string }): React.JSX.Element => {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [error, setError] = useState<UserError | null>(null)
  const [pages, setPages] = useState<number | null>(null)
  // 여러 쪽짜리 문서에서 1쪽만 보여 주면 나머지를 볼 길이 없다.
  // 어느 파일의 몇 쪽인지 함께 들고 있는다 — 파일이 바뀌면 effect 없이 1쪽으로 돌아간다
  const [at, setAt] = useState<{ rel: string; page: number }>({ rel, page: 1 })
  const page = at.rel === rel ? at.page : 1
  const setPage = (next: (current: number) => number): void => setAt({ rel, page: next(page) })
  const platform = usePlatform()

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      try {
        const res = await fetch(`vault://local/${encodeURI(rel)}`)
        if (!res.ok) throw new Error(getT().doc.loadFailed(res.status))
        const doc = await pdfjs.getDocument({ data: await res.arrayBuffer() }).promise
        if (cancelled) {
          void doc.cleanup()
          return
        }
        setPages(doc.numPages)
        const shown = await doc.getPage(Math.min(page, doc.numPages))
        const viewport = shown.getViewport({ scale: 1.5 })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        await shown.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
        void doc.cleanup()
      } catch (err) {
        if (!cancelled) setError(toUserError(err, getT().sourceView.pdf.failed))
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [rel, page])

  if (error) {
    return (
      <div className="flex flex-col items-start gap-2 p-4">
        <ErrorNote error={error} />
        <Button variant="outline" size="sm" onClick={() => void window.api.revealInFinder(rel)}>
          {t.shell.revealIn(fileManagerName(platform))}
        </Button>
      </div>
    )
  }
  const total = pages ?? 1
  return (
    <div className="p-4" data-testid="sources-pdf">
      <canvas
        ref={canvasRef}
        className="max-w-full"
        role="img"
        aria-label={t.sourceView.pdf.pageOf(rel, Math.min(page, total), total)}
      />
      <div className="mt-2 flex items-center gap-2">
        <p
          className="text-caption text-muted-foreground tabular-nums"
          data-testid="pdf-page"
          aria-live="polite"
        >
          {t.sourceView.pdf.pages(Math.min(page, total), total)}
        </p>
        {total > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t.sourceView.pdf.previous}
              data-testid="pdf-prev"
              disabled={page <= 1}
              onClick={() => setPage((n) => Math.max(1, n - 1))}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t.sourceView.pdf.next}
              data-testid="pdf-next"
              disabled={page >= total}
              onClick={() => setPage((n) => Math.min(total, n + 1))}
            >
              <ChevronRight aria-hidden />
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-caption text-muted-foreground"
          data-testid="pdf-reveal"
          onClick={() => void window.api.revealInFinder(rel)}
        >
          {t.shell.revealIn(fileManagerName(platform))}
        </Button>
      </div>
    </div>
  )
}
