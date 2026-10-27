// 자료 미리보기 — 중앙 문서 자리에서 md 가 아닌 파일(그림·소리·영상·PDF·txt·그 밖)을 연다.
// 파일 바이트는 vault:// 로 읽는다(확장자 표·상한·Range 는 프로토콜 한 곳).
// 미리보기 없는 형식(.canvas·오피스 파일 등)은 Obsidian 이나 OS 파일 탐색기로 연다.
import { useEffect, useRef, useState } from 'react'
import { History, Pencil } from 'lucide-react'
import type { EditorView } from 'codemirror'
import type { DocVersion } from '../../../shared/ipc-contract'
import { Button } from '../components/ui/button'
import { ViewHeader } from '../components/layout/view'
import { PdfPreview } from './sources-pdf'
import { MediaPreview } from '../components/media-preview'
import { OpenElsewhere, RevealButton } from '../components/open-elsewhere'
import { useVaultText } from '../lib/use-vault-text'
import { ErrorNote } from '../components/error-note'
import type { UserError } from '../lib/user-error'
import { folderLabel } from '../lib/vault-path'
import { extOf, fileKind, isTextFile } from '../../../shared/vault-file-types'
import { useWorkbench } from '../store/workbench'
import { HistoryDiff } from './wiki/history-diff'
import { CodePreview } from './sources-code'
import { codeLangFor, editLangFor, type EditableCodeLang } from '../lib/code-lang'
import { CodeEditor } from './sources-code-editor'
import { sha256Hex } from '../lib/sha256'
import { HtmlPreview } from './sources-html'
import { OfficePreview } from './sources-office'
import { ImagePreview } from './sources-image'
import { BasePreview } from './sources-base'
import { TablePreview } from './sources-table'
import { MarkdownPreview } from './sources-markdown'
import { useT } from '../lib/i18n'

const fileName = (rel: string): string => rel.split('/').pop() ?? rel

export const SourcePreview = ({ rel }: { rel: string }): React.JSX.Element => {
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  // 파일이 바뀌면 맨 위부터 — 칸을 같이 쓰므로 묵은 스크롤이 짧은 파일의 밑바닥을 보여준다
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [rel])
  const toggleHistory = useWorkbench((s) => s.toggleHistory)
  const historyShown = useWorkbench((s) => s.chatOpen && s.chatTab === 'history')
  const pickVersion = useWorkbench((s) => s.pickVersion)
  const versionPick = useWorkbench((s) => s.versionPick)
  // 고른 버전은 그 파일을 보는 동안만이다 — 다른 파일로 오면 내려놓는다(리더의 같은 규칙, `wiki-view.tsx`)
  const pickRel = versionPick?.rel ?? null
  useEffect(() => {
    if (pickRel !== null && pickRel !== rel) pickVersion(null)
  }, [pickRel, rel, pickVersion])
  // 글·코드 고치기 — json·html·yaml·그림·PDF·표는 읽기 전용이다
  const kind = fileKind(rel)
  const editLang = editLangFor(extOf(rel), kind)
  // 어떤 파일을 고치는지(rel까지) 들고 있는다 — 다른 파일을 열면 고치던 자리는 닫힌다.
  // 바뀜이 있으면 이동 가드가 먼저 묻는다(document.ts)
  const [editingRel, setEditingRel] = useState<string | null>(null)
  const [savedRel, setSavedRel] = useState<string | null>(null)
  const editing = editingRel === rel
  return (
    <>
      <ViewHeader title={fileName(rel)} description={folderLabel(rel)} descriptionTitle={rel}>
        {/* 미리보기 종류와 무관하게 — 그림·글·PDF 모두 같은 자리에서 파일 탐색기로 간다 */}
        <RevealButton rel={rel} testId="source-reveal" />
        {/* 글자 파일만 — 그림·PDF 는 줄로 견줄 것이 없다 */}
        {isTextFile(rel) && (
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            data-testid="source-history"
            aria-pressed={historyShown}
            aria-label={t.sourceView.history}
            onClick={toggleHistory}
          >
            <History aria-hidden />
          </Button>
        )}
        {editLang !== null && !editing && (
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            data-testid="source-edit"
            aria-label={t.sourceView.edit}
            onClick={() => {
              setSavedRel(null)
              setEditingRel(rel)
            }}
          >
            <Pencil aria-hidden />
          </Button>
        )}
      </ViewHeader>
      {savedRel === rel && (
        <p
          role="status"
          data-testid="source-saved"
          className="px-6 pt-2 text-caption text-muted-foreground"
        >
          {t.sourceView.saved}
        </p>
      )}
      {versionPick !== null && versionPick.rel === rel ? (
        <SourceCompare rel={rel} version={versionPick.version} onClose={() => pickVersion(null)} />
      ) : editing && editLang !== null ? (
        <EditableCodeBlock
          key={rel}
          rel={rel}
          lang={editLang}
          onClose={(saved) => {
            setEditingRel(null)
            if (saved) setSavedRel(rel)
          }}
        />
      ) : (
        <div
          ref={scrollRef}
          role="region"
          aria-label={t.sourceView.previewOf(fileName(rel))}
          tabIndex={0}
          className="scrollbar-thin min-h-0 flex-1 overflow-auto outline-none"
          data-testid="sources-preview"
        >
          <SourceBody rel={rel} />
        </div>
      )}
    </>
  )
}

/** 글·코드 고치기 칸 — 읽은 글로 열고, 저장하면 `edit:` 커밋 하나로 남는다 */
const EditableCodeBlock = ({
  rel,
  lang,
  onClose
}: {
  rel: string
  lang: EditableCodeLang
  onClose: (saved: boolean) => void
}): React.JSX.Element => {
  const t = useT()
  const { text, error } = useVaultText(rel)
  const viewRef = useRef<EditorView | null>(null)
  const setEditorDirty = useWorkbench((s) => s.setEditorDirty)
  const [dirty, setDirty] = useState(false)
  const [armed, setArmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // 나갔다가 돌아와도 바뀜 표시가 남지 않게 — 칸이 닫힐 때 풀어 둔다
  useEffect(() => () => setEditorDirty(false), [setEditorDirty])

  const save = async (): Promise<void> => {
    const view = viewRef.current
    if (view === null || text === null || saving) return
    const next = view.state.doc.toString()
    if (next === text) {
      onClose(false)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const result = await window.api.writeTextFile(rel, next, await sha256Hex(text))
      if ('error' in result) {
        setSaveError(result.error)
        return
      }
      setEditorDirty(false)
      onClose(true)
    } finally {
      setSaving(false)
    }
  }

  if (error) return <ErrorNote error={error} className="p-4" />
  if (text === null) {
    return (
      <p role="status" className="p-4 text-caption text-muted-foreground">
        {t.preview.loading}
      </p>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 py-2">
        <Button
          size="sm"
          data-testid="source-save"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? t.sourceView.saving : t.sourceView.save}
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="source-cancel"
          onClick={() => {
            if (dirty && !armed) {
              setArmed(true)
              return
            }
            setEditorDirty(false)
            onClose(false)
          }}
        >
          {dirty && !armed
            ? t.sourceView.discard
            : armed
              ? t.sourceView.discardConfirm
              : t.sourceView.cancel}
        </Button>
        {dirty && (
          <span className="text-caption text-muted-foreground" data-testid="source-dirty">
            {t.sourceView.dirty}
          </span>
        )}
        <span className="text-caption text-muted-foreground">{t.sourceView.saveKey}</span>
      </div>
      {saveError !== null && (
        <ErrorNote
          error={{ text: saveError, detail: null } satisfies UserError}
          className="px-6 pb-2"
        />
      )}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        <CodeEditor
          key={rel}
          initialText={text}
          lang={lang}
          viewRef={viewRef}
          onDirtyChange={(next) => {
            setDirty(next)
            setArmed(false)
            setEditorDirty(next)
          }}
          onSave={() => void save()}
        />
      </div>
    </div>
  )
}

/** 기록에서 고른 버전 — 미리보기 자리에 지금 글과 다른 줄을 보인다. 되돌리기는 없다(쓰는 길이 md 전용이다) */
const SourceCompare = ({
  rel,
  version,
  onClose
}: {
  rel: string
  version: DocVersion
  onClose: () => void
}): React.JSX.Element => {
  const t = useT()
  const { text, error } = useVaultText(rel)
  // 버전을 누른 자리(옆 칸 목록)에 초점을 두면 가운데 비교가 열렸는지 모른다 — 제목으로 옮긴다.
  // 글은 늦게 오므로 다 읽힌 뒤에 옮긴다(읽는 중에는 제목이 없다).
  // 쓰는 중이면 뺏지 않는다 — 옆 칸 규칙(use-sidecar-focus)과 같다
  const loaded = text !== null && error === null
  const titleRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (!loaded) return
    const active = document.activeElement
    if (active instanceof HTMLElement && active.closest('[data-testid="chat-pane"]') !== null)
      return
    const typing =
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLInputElement ||
      (active instanceof HTMLElement && active.isContentEditable)
    if (!typing) titleRef.current?.focus()
  }, [loaded])
  if (error) return <ErrorNote error={error} className="p-4" />
  if (text === null)
    return (
      <p role="status" className="text-caption text-muted-foreground p-4">
        {t.preview.loading}
      </p>
    )
  // 버전을 바꿔도 지금 글은 다시 읽지 않는다 — 비교만 그 버전으로 새로 선다
  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
      <p
        ref={titleRef}
        tabIndex={-1}
        data-testid="source-compare-title"
        className="text-callout px-6 pt-4 font-medium outline-none"
      >
        {t.sourceView.comparing} {fileName(rel)}
      </p>
      <HistoryDiff key={version.rev} rel={rel} version={version} current={text} onClose={onClose} />
    </div>
  )
}

const SourceBody = ({ rel }: { rel: string }): React.JSX.Element => {
  const t = useT()
  const kind = fileKind(rel)
  const ext = extOf(rel)

  // .md 는 리더가 연다 — 여기 오는 문서는 .markdown·.mdx 다
  if (kind === 'markdown') return <MarkdownPreview key={rel} rel={rel} />
  if (ext === '.csv' || ext === '.tsv')
    return <TablePreview key={rel} rel={rel} sep={ext === '.csv' ? ',' : '\t'} />
  if (ext === '.yml' || ext === '.yaml') return <CodePreview key={rel} rel={rel} lang="yaml" />
  // 코드 — 구문 색이 있는 확장자는 CodeMirror 로, 나머지는 글자 그대로 읽는다
  if (kind === 'text' || kind === 'code') {
    const lang = codeLangFor(ext)
    if (lang) return <CodePreview key={rel} rel={rel} lang={lang} />
    return <TxtPreview rel={rel} />
  }
  if (kind === 'image') return <ImagePreview key={rel} rel={rel} alt={fileName(rel)} />
  if (kind === 'audio' || kind === 'video') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <MediaPreview key={rel} rel={rel} kind={kind} />
      </div>
    )
  }
  if (kind === 'pdf') return <PdfPreview key={rel} rel={rel} />
  if (kind === 'json') return <CodePreview key={rel} rel={rel} lang="json" />
  if (kind === 'html') return <HtmlPreview key={rel} rel={rel} />
  if (kind === 'office') return <OfficePreview key={rel} rel={rel} />
  if (kind === 'base') return <BasePreview key={rel} rel={rel} />
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-callout">{t.sourceView.unsupported}</p>
      <p className="text-caption text-muted-foreground">{t.sourceView.unsupportedHint}</p>
      <OpenElsewhere rel={rel} />
    </div>
  )
}

const TxtPreview = ({ rel }: { rel: string }): React.JSX.Element => {
  const t = useT()
  const { text, error } = useVaultText(rel)
  if (error) return <ErrorNote error={error} className="p-4" />
  if (text === null)
    return (
      <p role="status" className="text-caption text-muted-foreground p-4">
        {t.preview.loading}
      </p>
    )
  return (
    <pre
      aria-label={t.sourceView.bodyOf(fileName(rel))}
      className="mx-auto max-w-[42rem] px-8 py-10 font-mono text-callout whitespace-pre-wrap select-text"
      data-testid="sources-txt"
    >
      {text}
    </pre>
  )
}
