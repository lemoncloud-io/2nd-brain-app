// 좌우 분할 — 문서 자리 오른쪽에 문서 한 장을 더 띄운다(Obsidian 의 오른쪽으로 나누기).
// 왼쪽(가운데 리더)과 따로 움직인다: 이 칸의 링크는 이 칸만 바꾸고 이동 기록에 쌓지 않는다.
// 이 칸에서도 편집한다 — 자료를 읽으며 노트를 쓰는 자리라서다. 저장은 같은 `edit: <slug>` 커밋.
import { useEffect, useRef, useState } from 'react'
import { ArrowLeftToLine, Pencil, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { WikilinkMarkdown } from '../../lib/wikilink-markdown'
import { openExternal } from '../../lib/open-external'
import { folderLabel } from '../../lib/vault-path'
import { useWorkbench } from '../../store/workbench'
import { FrontmatterPanel } from './frontmatter-panel'
import { WikiEditor } from './wiki-editor'
import { usePageIndex, useWikiRead, withoutTitleHeading } from './use-wiki-read'
import { useCheckboxToggle } from './use-checkbox-toggle'
import { useT } from '../../lib/i18n'

export const SplitPane = ({ rel }: { rel: string }): React.JSX.Element => {
  const t = useT()
  const openSplit = useWorkbench((s) => s.openSplit)
  const closeSplit = useWorkbench((s) => s.closeSplit)
  const navigate = useWorkbench((s) => s.navigate)
  const openFile = useWorkbench((s) => s.openFile)
  const index = usePageIndex()
  const { read, error, reload } = useWikiRead(rel)
  const { toggle } = useCheckboxToggle(read, reload)
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const editingThis = editing && read !== null && read.page.rel === rel
  const scrollRef = useRef<HTMLDivElement>(null)
  // 문서가 바뀌면 맨 위부터 — 리더와 같은 칸을 쓰므로 묵은 스크롤이 밑바닥을 보여준다
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [rel])

  return (
    <section
      aria-label={t.wikiDoc.split.label}
      data-testid="split-pane"
      className="flex min-h-0 min-w-72 flex-1 flex-col border-l border-hairline"
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-hairline pr-1 pl-3">
        <p
          title={rel}
          data-testid="split-title"
          className="min-w-0 flex-1 truncate text-caption text-muted-foreground"
        >
          {read ? read.page.title : folderLabel(rel)}
        </p>
        {read && !editingThis && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            data-testid="split-edit"
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden /> {t.wikiDoc.edit}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t.wikiDoc.split.toMain}
          title={t.wikiDoc.split.toMain}
          data-testid="split-to-main"
          disabled={editingThis}
          onClick={() => {
            navigate(rel)
            closeSplit()
          }}
        >
          <ArrowLeftToLine aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t.wikiDoc.split.close}
          // 고친 글을 말없이 버리지 않는다 — 저장하거나 취소한 뒤 닫는다
          title={editingThis && dirty ? t.wikiDoc.split.closeBlocked : t.wikiDoc.split.close}
          disabled={editingThis && dirty}
          data-testid="split-close"
          onClick={closeSplit}
        >
          <X aria-hidden />
        </Button>
      </div>
      {error ? (
        <div className="px-4 py-10" data-testid="split-error">
          <p className="text-heading">{error.text}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={reload}>
            {t.wikiDoc.reopen}
          </Button>
        </div>
      ) : read === null ? (
        <p role="status" className="px-4 py-10 text-caption text-muted-foreground">
          {t.preview.loading}
        </p>
      ) : editingThis ? (
        <WikiEditor
          // 해시로 두면 받기가 문서를 바꿀 때 편집기가 새로 떠 입력한 글이 사라진다 — 바뀐 것은 편집기가 알린다
          key={read.page.rel}
          rel={read.page.rel}
          initialText={read.text}
          baseHash={read.hash}
          index={index}
          onNavigate={openSplit}
          onOpenExternal={openExternal}
          onSaved={(renamedTo) => {
            setEditing(false)
            setDirty(false)
            if (renamedTo !== null) openSplit(renamedTo)
            else reload()
          }}
          onCancel={() => {
            setEditing(false)
            setDirty(false)
          }}
          onDirtyChange={setDirty}
        />
      ) : (
        <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <article data-testid="split-reader" className="mx-auto max-w-[42rem] px-6 pt-8 pb-20">
            <h1 className="text-title wrap-anywhere">{read.page.title}</h1>
            <FrontmatterPanel page={read.page} />
            <div className="prose-wiki mt-6">
              <WikilinkMarkdown
                text={withoutTitleHeading(read.page.body, read.page.title)}
                index={index}
                onNavigate={openSplit}
                onOpenExternal={openExternal}
                onOpenFile={openFile}
                onToggleCheckbox={toggle}
              />
            </div>
          </article>
        </div>
      )}
    </section>
  )
}
