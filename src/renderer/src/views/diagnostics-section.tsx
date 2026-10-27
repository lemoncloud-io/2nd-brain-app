import { useState } from 'react'
import { Button } from '../components/ui/button'
import { ErrorNote } from '../components/error-note'
import { useExportDiagnostics } from '../hooks/use-export-diagnostics'
import DeveloperModeSection from './developer-mode-section'
import { getT, useT } from '../lib/i18n'
import { toUserError, type UserError } from '../lib/user-error'

// 설정 → 고급 → 문제 해결 — 진단 정보 내보내기(팀에 보낼 파일 하나)·진단 기록 폴더 열기
const DiagnosticsSection = (): React.JSX.Element => {
  const t = useT()
  const exporter = useExportDiagnostics()
  const [openFailed, setOpenFailed] = useState<UserError | null>(null)

  const openFolder = (): void => {
    setOpenFailed(null)
    const fail = (detail: unknown): void =>
      setOpenFailed(toUserError(detail, getT().diagnostics.openLogsFailed))
    window.api
      .openLogsFolder()
      .then((error) => error && fail(error))
      .catch(fail)
  }

  return (
    <div data-testid="diagnostics-section">
      <p className="text-callout text-foreground">{t.diagnostics.title}</p>
      <p className="mt-1 text-caption text-muted-foreground">{t.diagnostics.hint}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          data-testid="diagnostics-export"
          disabled={exporter.busy}
          onClick={exporter.run}
        >
          {t.diagnostics.exportDiagnostics}
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="diagnostics-open-logs"
          onClick={openFolder}
        >
          {t.diagnostics.openLogs}
        </Button>
      </div>
      {/* 알림 칸은 늘 두고 글만 바꾼다 — 글과 함께 생긴 칸은 보조기기가 읽지 않을 수 있다. 전체 경로는 툴팁에 */}
      <p
        role="status"
        title={exporter.saved ?? undefined}
        className="mt-2 text-caption text-muted-foreground empty:hidden"
        data-testid="diagnostics-note"
      >
        {exporter.savedName && t.diagnostics.exportDone(exporter.savedName)}
      </p>
      {exporter.error && (
        <ErrorNote error={exporter.error} testId="diagnostics-export-failed" className="mt-2" />
      )}
      {openFailed && (
        <ErrorNote error={openFailed} testId="diagnostics-open-logs-failed" className="mt-2" />
      )}
      <div className="mt-4">
        <DeveloperModeSection />
      </div>
    </div>
  )
}

export default DiagnosticsSection
