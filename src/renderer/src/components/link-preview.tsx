// 링크 호버 미리보기 칸의 본문 — 그 페이지를 읽어 앞부분을 그린다. 칸 여닫기는 `lib/use-link-preview`.
import { useEffect, useState, type ReactNode } from 'react'
import type { WikiReadResult } from '../../../shared/ipc-contract'
import { toUserError } from '../lib/user-error'
import { previewText } from '../lib/preview-text'
import { getT } from '../lib/i18n'
import { useT } from '../lib/i18n'

type Loaded = { read: WikiReadResult } | { error: string } | null

export const PreviewBody = ({
  rel,
  renderBody
}: {
  rel: string
  renderBody: (text: string) => ReactNode
}): React.JSX.Element => {
  const t = useT()
  const [loaded, setLoaded] = useState<Loaded>(null)

  // 뜰 때마다 새로 읽는다 — 닫히면 이 칸이 사라지니 열려 있는 동안만 기다리면 된다
  useEffect(() => {
    let stale = false
    window.api
      .readWikiPage(rel)
      .then((result) => {
        if (stale) return
        setLoaded(
          'error' in result
            ? { error: toUserError(result.error, getT().shell.linkOpenFailed).text }
            : { read: result }
        )
      })
      .catch((e: unknown) => {
        if (!stale) setLoaded({ error: toUserError(e, getT().shell.linkOpenFailed).text })
      })
    return () => {
      stale = true
    }
  }, [rel])

  if (loaded === null)
    return (
      <p role="status" className="text-caption text-muted-foreground">
        {t.shell.loading}
      </p>
    )
  if ('error' in loaded)
    return (
      <p role="alert" className="text-caption text-destructive">
        {loaded.error}
      </p>
    )
  const { text, cut } = previewText(loaded.read.page.body, loaded.read.page.title)
  return (
    <>
      <div className="prose-wiki prose-compact">{renderBody(text)}</div>
      {cut && <p className="mt-3 text-caption text-muted-foreground">{t.shell.linkExcerpt}</p>}
    </>
  )
}
