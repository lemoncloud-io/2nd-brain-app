// 워드·파워포인트 미리보기 — main 이 `vault://…?preview` 로 그림까지 담은 HTML 을 만들어 준다.
// 받은 HTML 은 아무 권한 없는 iframe(sandbox="")에 srcDoc 으로 띄운다: 스크립트·폼·창 위 이동이 막히고,
// 앱 CSP 를 물려받아 바깥 자원을 부르지 못하며 frame 안 이동도 `frame-src 'self' vault:` 밖으로는 못 간다. 상태 코드로 실패 문구를 고르려고 iframe src 대신 fetch 로 받는다.
import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { ErrorNote } from '../components/error-note'
import { Button } from '../components/ui/button'
import { officeFailure } from '../lib/file-preview-text'
import { toUserError, type UserError } from '../lib/user-error'
import { vaultUrl } from '../../../shared/vault-file-types'
import { useT } from '../lib/i18n'

type Loaded = { html: string } | { error: UserError } | null

export const OfficePreview = ({ rel }: { rel: string }): React.JSX.Element => {
  const t = useT()
  const [loaded, setLoaded] = useState<Loaded>(null)

  useEffect(() => {
    let live = true
    fetch(`${vaultUrl(rel)}?preview`)
      .then(async (res): Promise<Loaded> => {
        if (!res.ok)
          return { error: { text: officeFailure(res.status), detail: `HTTP ${res.status}` } }
        return { html: await res.text() }
      })
      .catch((cause: unknown): Loaded => ({ error: toUserError(cause, officeFailure(0)) }))
      .then((next) => {
        if (live) setLoaded(next)
      })
    return () => {
      live = false
    }
  }, [rel])

  const openDefault = (
    <Button
      variant="ghost"
      size="sm"
      data-testid="sources-office-open"
      onClick={() => void window.api.openInBrowser(rel)}
    >
      <ExternalLink aria-hidden />
      {t.preview.openDefault}
    </Button>
  )

  if (loaded === null) {
    return (
      <p role="status" className="p-4 text-caption text-muted-foreground">
        {t.preview.loading}
      </p>
    )
  }
  if ('error' in loaded) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <ErrorNote error={loaded.error} testId="sources-office-error" />
        {openDefault}
      </div>
    )
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
        <p className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
          {t.preview.officeNote}
        </p>
        {openDefault}
      </div>
      <iframe
        sandbox=""
        srcDoc={loaded.html}
        title={rel}
        className="min-h-0 w-full flex-1 bg-white"
        data-testid="sources-office"
      />
    </div>
  )
}
