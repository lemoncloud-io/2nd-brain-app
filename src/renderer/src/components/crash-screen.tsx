// 앱 전체 경계의 복구 화면 — 다시 열기·진단 정보 내보내기. 문구는 사전에서
import { useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { ErrorNote } from './error-note'
import { useT } from '../lib/i18n'
import { useExportDiagnostics } from '../hooks/use-export-diagnostics'

export const CrashScreen = (): React.JSX.Element => {
  const t = useT()
  const exporter = useExportDiagnostics()
  const title = useRef<HTMLHeadingElement>(null)
  // 눌려 있던 요소가 사라져 초점이 body 로 떨어진다 — 제목으로 옮겨 다음 Tab 이 "다시 열기" 에 닿게
  useEffect(() => title.current?.focus(), [])
  return (
    <main
      data-testid="app-crash"
      className="flex h-screen flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <h1 ref={title} tabIndex={-1} className="text-title font-semibold outline-none">
        {t.diagnostics.crashTitle}
      </h1>
      <p role="alert" className="max-w-md text-muted-foreground">
        {t.diagnostics.crashBody}
      </p>
      <div className="flex gap-2">
        <Button data-testid="app-crash-reload" onClick={() => window.location.reload()}>
          {t.diagnostics.reopen}
        </Button>
        <Button
          variant="outline"
          data-testid="app-crash-export"
          disabled={exporter.busy}
          onClick={exporter.run}
        >
          {t.diagnostics.exportDiagnostics}
        </Button>
      </div>
      <p
        role="status"
        title={exporter.saved ?? undefined}
        className="text-caption text-muted-foreground empty:hidden"
        data-testid="app-crash-export-note"
      >
        {exporter.savedName && t.diagnostics.exportDone(exporter.savedName)}
      </p>
      {exporter.error && <ErrorNote error={exporter.error} testId="app-crash-export-failed" />}
    </main>
  )
}
