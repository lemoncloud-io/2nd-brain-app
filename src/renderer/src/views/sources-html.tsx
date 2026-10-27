// html 미리보기 — 기본은 페이지 모양, 버튼 하나로 원문과 오간다.
// 페이지는 `vault://…?page` 로 따로 띄운다: 응답의 CSP(`HTML_PAGE_CSP`)와 iframe sandbox 가 둘 다
// 고유 출처를 주지 않으므로 스크립트는 돌아도 앱·보관함의 다른 파일에는 닿지 못한다.
// 한 파일에 든 페이지(보고서·뷰어 빌드)는 그대로 돌고, 옆에 둔 js 를 읽는 페이지는 브라우저로 넘긴다.
import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Button } from '../components/ui/button'
import { vaultUrl } from '../../../shared/vault-file-types'
import { CodePreview } from './sources-code'
import { useT } from '../lib/i18n'

export const HtmlPreview = ({ rel }: { rel: string }): React.JSX.Element => {
  const t = useT()
  const [source, setSource] = useState(false)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
        <p className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
          {source ? t.sourceView.source : t.sourceView.html.note}
        </p>
        <Button
          variant="ghost"
          size="sm"
          data-testid="sources-html-browser"
          onClick={() => void window.api.openInBrowser(rel)}
        >
          <ExternalLink aria-hidden />
          {t.sourceView.html.openBrowser}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="sources-html-toggle"
          onClick={() => setSource((on) => !on)}
        >
          {source ? t.sourceView.html.asPage : t.sourceView.showSource}
        </Button>
      </div>
      {source ? (
        <CodePreview rel={rel} lang="html" />
      ) : (
        <iframe
          // same-origin 을 주지 않는다 — 스크립트만 허용한 고유 출처 없는 문서다(폼·이동·팝업도 막힌다)
          sandbox="allow-scripts"
          src={`${vaultUrl(rel)}?page`}
          title={rel}
          className="min-h-0 w-full flex-1 bg-white"
          data-testid="sources-html"
        />
      )}
    </div>
  )
}
