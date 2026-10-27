// md 가 아닌 문서(.markdown·.mdx) 미리보기 — 리더와 같은 렌더러로 읽기만 한다.
// 리더·편집·위키 목록은 .md 만 다룬다. 머리말(frontmatter)은 빼고 본문만 그린다.
import { useState } from 'react'
import { Button } from '../components/ui/button'
import { ErrorNote } from '../components/error-note'
import { useVaultText } from '../lib/use-vault-text'
import { WikilinkMarkdown } from '../lib/wikilink-markdown'
import { openExternal } from '../lib/open-external'
import { frontmatterLength } from '../../../shared/wiki/parse'
import { useWorkbench } from '../store/workbench'
import { usePageIndex } from './wiki/use-wiki-read'
import { useT } from '../lib/i18n'

export const MarkdownPreview = ({ rel }: { rel: string }): React.JSX.Element => {
  const t = useT()
  const { text, error } = useVaultText(rel)
  const [source, setSource] = useState(false)
  const navigate = useWorkbench((s) => s.navigate)
  const openFile = useWorkbench((s) => s.openFile)
  const index = usePageIndex()

  if (error) return <ErrorNote error={error} className="p-4" />
  if (text === null)
    return (
      <p role="status" className="p-4 text-caption text-muted-foreground">
        {t.preview.loading}
      </p>
    )

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2">
        <p className="text-caption text-muted-foreground">
          {source ? t.sourceView.source : t.sourceView.markdown.readOnly}
        </p>
        <Button
          variant="ghost"
          size="sm"
          data-testid="sources-markdown-toggle"
          onClick={() => setSource((on) => !on)}
        >
          {source ? t.sourceView.markdown.asDoc : t.sourceView.showSource}
        </Button>
      </div>
      {source ? (
        <pre className="mx-auto w-full max-w-[42rem] px-8 py-10 font-mono text-callout whitespace-pre-wrap select-text">
          {text}
        </pre>
      ) : (
        <article
          data-testid="sources-markdown"
          className="prose-wiki mx-auto w-full max-w-[42rem] px-6 pt-8 pb-20"
        >
          <WikilinkMarkdown
            text={text.slice(frontmatterLength(text))}
            index={index}
            onNavigate={navigate}
            onOpenExternal={openExternal}
            onOpenFile={openFile}
          />
        </article>
      )}
    </div>
  )
}
