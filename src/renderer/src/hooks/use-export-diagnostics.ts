import { useState } from 'react'
import { getT } from '../lib/i18n'
import { toUserError, type UserError } from '../lib/user-error'

/** 경로의 마지막 조각 — 구분자는 OS 마다 다르다 */
export const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path

export interface ExportDiagnostics {
  run(): void
  busy: boolean
  /** 저장한 경로 — 취소했거나 아직이면 null */
  saved: string | null
  /** 저장한 파일 이름 — 화면 글에 쓴다(전체 경로는 툴팁) */
  savedName: string | null
  error: UserError | null
}

/** 진단 정보 내보내기 — 설정 문제 해결 칸과 복구 화면이 같이 쓴다. 저장은 main 이 대화상자로 */
export const useExportDiagnostics = (): ExportDiagnostics => {
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<UserError | null>(null)
  const run = (): void => {
    setSaved(null)
    setError(null)
    setBusy(true)
    // preload 가 없어 동기로 던져도(복구 화면이 뜨는 경우일 수 있다) 버튼이 잠긴 채 남지 않게 promise 안에서 부른다
    Promise.resolve()
      .then(() => window.api.exportDiagnostics())
      .then(setSaved)
      .catch((err: unknown) => setError(toUserError(err, getT().diagnostics.exportFailed)))
      .finally(() => setBusy(false))
  }
  const savedName = saved && fileName(saved)
  return { run, busy, saved, savedName, error }
}
