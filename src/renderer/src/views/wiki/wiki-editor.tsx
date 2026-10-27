// 편집기 — 한 칸에서 읽으며 쓴다(라이브 미리보기, `lib/live-preview.ts`). "꾸밈 기호 보기" 를 켜면 기호가 다 보인다.
// 그림은 붙여넣거나 끌어 놓으면 `attachments/` 에 두고 `![[…]]` 로 건다.
// 저장은 기본 브랜치 `edit: <slug>` 커밋 1개. 잠금(위키화·확정)이면 비활성+사유.
import { useEffect, useRef, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { Compartment, EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import type { PageRef } from '../../../../shared/wiki/parse'
import { bodyPosAt, frontmatterLines, livePreview } from '../../lib/live-preview'
import { fillTemplate, insertTemplate } from '../../../../shared/wiki/insert-template'
import { TemplateMenu } from './template-menu'
import { InlineEditBar, type EditTarget } from './inline-edit-bar'
import { Button } from '../../components/ui/button'
import { ErrorNote } from '../../components/error-note'
import { toUserError, type UserError } from '../../lib/user-error'
import { EditorCount } from './editor-count'
import { getT, useT } from '../../lib/i18n'

const isMacKeys = navigator.userAgent.includes('Mac')

/** 파일 이름에서 확장자를 뺀 것 — 이름 칸이 보여 주고 고친다 */
const stemOf = (rel: string): string => {
  const base = rel.slice(rel.lastIndexOf('/') + 1)
  return base.toLowerCase().endsWith('.md') ? base.slice(0, -3) : base
}

interface WikiEditorProps {
  rel: string
  initialText: string
  /** 지금 디스크의 해시 — 편집하는 사이 바뀌면(팀 변경 받기·다른 앱) 편집 시작 때 것과 달라진다 */
  baseHash: string
  index: PageRef[]
  onNavigate: (rel: string) => void
  onOpenExternal: (url: string) => void
  /** 저장이 끝났다 — 이름을 바꿨으면 새 경로가 온다 */
  onSaved: (renamedTo: string | null) => void
  onCancel: () => void
  /** 새 노트 — 이름 칸에 초점을 두고 "제목 없음" 을 골라 둔다 */
  nameFirst?: boolean
  /** 열 때 한 번 읽는 리더 스크롤 비율(0~1) — 그 자리의 본문 줄에서 연다. 없으면 본문 첫 줄 */
  startRatio?: () => number
  // 원문과 달라졌는지 — 떠나기 전 확인은 뷰가 한 곳에서 묻는다
  onDirtyChange: (dirty: boolean) => void
}

/** 붙여넣기·끌어 놓기로 들어온 파일을 보관함에 두고 넣을 링크 글을 돌려준다 */
const attachFiles = async (files: File[]): Promise<{ text: string; error: string | null }> => {
  const links: string[] = []
  for (const file of files) {
    const saved = await window.api.saveAttachment(
      file.name,
      new Uint8Array(await file.arrayBuffer())
    )
    if ('error' in saved) return { text: links.join('\n'), error: saved.error }
    links.push(`![[${saved.rel}]]`)
  }
  return { text: links.join('\n'), error: null }
}

const filesOf = (list: FileList | null | undefined): File[] => (list ? Array.from(list) : [])

// `[[` 뒤에서 slug 자동완성
const wikiLinkCompletions =
  (index: PageRef[]) =>
  (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(/\[\[([^\]]*)$/)
    if (!before) return null
    return {
      from: before.from + 2,
      options: index.map((p) => ({
        label: p.slug,
        type: 'text',
        detail: p.rel,
        apply: `${p.slug}]]`
      })),
      validFor: /^[^\]]*$/
    }
  }

export const WikiEditor = ({
  rel,
  initialText,
  baseHash,
  index,
  onNavigate,
  onOpenExternal,
  onSaved,
  onCancel,
  onDirtyChange,
  nameFirst = false,
  startRatio
}: WikiEditorProps): React.JSX.Element => {
  const t = useT()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const initialName = stemOf(rel)
  const [name, setName] = useState(initialName)
  const getTextRef = useRef<() => string>(() => initialText)
  const [text, setText] = useState(initialText)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<UserError | null>(null)
  const [lockReason, setLockReason] = useState<string | null>(null)
  // 저장 기준은 편집을 시작한 순간의 해시다 — 받기 뒤 새로 읽은 해시로 저장하면 버퍼의 옛 글이 새 내용을 말없이 지운다
  const [startHash, setStartHash] = useState(baseHash)
  const changedOnDisk = baseHash !== startHash
  const [copied, setCopied] = useState(false)
  const copyMine = (): void => {
    navigator.clipboard
      .writeText(getTextRef.current())
      .then(() => setCopied(true))
      .catch((e: unknown) => setError(toUserError(e, getT().wikiDoc.editor.copyFailed)))
  }

  // 꾸밈 기호 보기 — 라이브 미리보기를 끄고 기호를 다 보인다
  const [source, setSource] = useState(false)
  // 고른 글이 있어야 "AI 로 고치기" 가 켜진다. 누른 순간의 범위가 고칠 자리다
  const [hasSelection, setHasSelection] = useState(false)
  // 아래 줄이 세는 고른 글 — 선택을 넓히는 동안은 기다렸다가 멈추면 한 번 받는다
  const [selected, setSelected] = useState('')
  const selectTimer = useRef<number | undefined>(undefined)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const previewSlot = useRef(new Compartment())
  const previewFor = (on: boolean): ReturnType<typeof livePreview> | [] =>
    on ? [] : livePreview({ index, onNavigate, onOpenExternal })

  useEffect(() => {
    const checkLock = (): void => {
      // 못 읽으면 잠긴 쪽으로 — 열린 채로 두면 위키화·확정 한가운데 저장이 들어가 뒤섞인다
      window.api
        .getEditLock()
        .then(setLockReason)
        .catch(() => setLockReason(getT().wikiDoc.editor.lockUnknown))
    }
    checkLock()
    return window.api.onActivityChanged(checkLock)
  }, [])

  useEffect(() => {
    // 읽던 자리에서 연다 — 맨 위(속성 블록)에 커서를 두면 접힌 속성이 펼쳐지고 읽던 곳을 잃는다
    const ratio = startRatio?.()
    const start = bodyPosAt(initialText, ratio)
    const view = new EditorView({
      parent: hostRef.current ?? undefined,
      state: EditorState.create({
        doc: initialText,
        selection: { anchor: start },
        extensions: [
          basicSetup,
          // basicSetup 의 찾기·바꾸기 패널(⌘F) 문구 — 편집기를 여는 때의 화면 언어로(DESIGN § 화면 말)
          EditorState.phrases.of(getT().wikiDoc.editor.searchPhrases),
          markdown({ base: markdownLanguage }),
          autocompletion({ override: [wikiLinkCompletions(index)] }),
          EditorView.lineWrapping,
          frontmatterLines,
          previewSlot.current.of(previewFor(false)),
          EditorView.domEventHandlers({
            paste: (event, view) => {
              const files = filesOf(event.clipboardData?.files)
              if (files.length === 0) return false
              event.preventDefault()
              const at = view.state.selection.main
              void attachFiles(files).then(({ text: link, error: failed }) => {
                if (link !== '') {
                  view.dispatch({
                    changes: { from: at.from, to: at.to, insert: link },
                    selection: { anchor: at.from + link.length }
                  })
                }
                if (failed) setError(toUserError(failed, getT().wikiDoc.editor.attachFailed))
              })
              return true
            },
            drop: (event, view) => {
              const files = filesOf(event.dataTransfer?.files)
              if (files.length === 0) return false
              event.preventDefault()
              const at =
                view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
                view.state.selection.main.head
              void attachFiles(files).then(({ text: link, error: failed }) => {
                if (link !== '') {
                  view.dispatch({
                    changes: { from: at, insert: link },
                    selection: { anchor: at + link.length }
                  })
                }
                if (failed) setError(toUserError(failed, getT().wikiDoc.editor.attachFailed))
              })
              return true
            }
          }),
          EditorView.updateListener.of((update) => {
            if (update.selectionSet || update.docChanged) {
              const { from, to } = update.state.selection.main
              setHasSelection(from !== to)
              window.clearTimeout(selectTimer.current)
              const { state } = update
              selectTimer.current = window.setTimeout(
                () => setSelected(state.sliceDoc(from, to)),
                200
              )
            }
            if (update.docChanged) {
              const value = update.state.doc.toString()
              getTextRef.current = () => value
              setText(value)
            }
          })
        ]
      })
    })
    viewRef.current = view
    if (ratio !== undefined && ratio > 0)
      view.dispatch({ effects: EditorView.scrollIntoView(start, { y: 'start' }) })
    if (nameFirst) nameRef.current?.select()
    return () => {
      window.clearTimeout(selectTimer.current)
      view.destroy()
    }
    // 편집기는 페이지를 열 때 한 번 만든다 — index 변화로 재생성하지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rel])

  // 템플릿 — 커서 자리에 본문을, 맨 위 속성에 템플릿 속성을 합친다. 되돌리기(⌘Z) 한 번으로 빠진다
  const pickTemplate = (templateRel: string): void => {
    void window.api
      .readWikiPage(templateRel)
      .then((result) => {
        const view = viewRef.current
        if ('error' in result) {
          setError(toUserError(result.error, getT().wikiDoc.editor.templateFailed))
          return
        }
        if (view === null) return
        const title = name.trim() || initialName
        const filled = fillTemplate(result.text, { title, now: new Date() })
        const doc = view.state.doc.toString()
        const out = insertTemplate(doc, view.state.selection.main.head, filled)
        view.dispatch({
          changes: { from: 0, to: doc.length, insert: out.text },
          selection: { anchor: out.cursor }
        })
        view.focus()
      })
      .catch((e: unknown) => setError(toUserError(e, getT().wikiDoc.editor.templateFailed)))
  }

  const startAiEdit = (): void => {
    const view = viewRef.current
    if (view === null) return
    const { from, to } = view.state.selection.main
    if (from === to) return
    setEditTarget({ from, to, selection: view.state.sliceDoc(from, to) })
  }

  // 제안을 받는 사이 고른 자리가 바뀌었으면 넣지 않는다 — 엉뚱한 곳을 덮는다
  const acceptAiEdit = (text: string): void => {
    const view = viewRef.current
    if (view === null || editTarget === null) return
    const { from, to, selection } = editTarget
    if (view.state.sliceDoc(from, to) !== selection) {
      setError(
        toUserError(getT().wikiDoc.editor.selectionMoved, getT().wikiDoc.editor.replaceFailed)
      )
      setEditTarget(null)
      return
    }
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from, head: from + text.length },
      userEvent: 'input.ai'
    })
    setEditTarget(null)
    view.focus()
  }

  const toggleSource = (): void => {
    const next = !source
    setSource(next)
    viewRef.current?.dispatch({ effects: previewSlot.current.reconfigure(previewFor(next)) })
  }

  const save = (): void => {
    if (saving || lockReason || changedOnDisk) return
    setSaving(true)
    setError(null)
    window.api
      .writeWikiPage(rel, getTextRef.current(), startHash)
      .then(async (result) => {
        if ('error' in result) {
          setError(toUserError(result.error, getT().wikiDoc.editor.saveFailed))
          return
        }
        // 이름은 본문을 쓴 뒤에 바꾼다 — 먼저 바꾸면 기준 해시를 든 경로가 사라진다
        const typed = name.trim()
        if (typed === '' || typed === initialName) {
          onSaved(null)
          return
        }
        // 글은 썼다 — 이름 바꾸기가 실패해 편집기가 남아도 다음 저장의 기준은 방금 쓴 글이다
        setStartHash(result.hash)
        const renamed = await window.api.renameVaultEntry(rel, typed)
        if ('error' in renamed) {
          setError(toUserError(renamed.error, getT().wikiDoc.editor.renameFailed))
          return
        }
        onSaved(renamed.rel)
      })
      // 저장 실패를 삼키면 "아무 일도 없었던 것" 으로 보이고 사용자는 고친 글을 잃는다
      .catch((e: unknown) => setError(toUserError(e, getT().wikiDoc.editor.saveFailed)))
      .finally(() => setSaving(false))
  }

  // 글 쓰는 화면이다 — 저장과 취소는 손을 떼지 않고도 되어야 한다
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault()
      save()
      return
    }
    if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
      e.stopPropagation()
      onCancel()
    }
  }

  useEffect(() => {
    onDirtyChange(text !== initialText || name.trim() !== initialName)
  }, [text, initialText, name, initialName, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="wiki-editor" onKeyDown={onKeyDown}>
      {/* 도구줄 단추는 리더 머리와 같은 32px 테두리 단추. 취소·저장은 오른쪽 묶음 — 좁아도 함께 줄을 넘는다 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-hairline px-6 py-2">
        {/* 이름 = 파일 이름. 트리·링크·⌘K 가 이 이름으로 찾는다. Enter 는 본문으로 넘어간다 */}
        <div className="flex min-w-0 flex-[1_1_10rem]">
          <input
            ref={nameRef}
            aria-label={t.wikiDoc.editor.name}
            data-testid="wiki-editor-name"
            value={name}
            autoFocus={nameFirst}
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
              e.preventDefault()
              viewRef.current?.focus()
            }}
            className="focus-ring h-8 min-w-0 flex-1 rounded-sm bg-transparent px-1 text-heading text-foreground placeholder:text-muted-foreground"
            placeholder={t.wikiDoc.editor.untitled}
          />
        </div>
        <Button
          variant={editTarget ? 'secondary' : 'outline'}
          size="sm"
          onClick={startAiEdit}
          disabled={!hasSelection}
          data-testid="wiki-ai-edit"
          title={t.wikiDoc.editor.aiEditHint}
        >
          {t.wikiDoc.editor.aiEdit}
        </Button>
        <TemplateMenu onPick={pickTemplate} />
        <Button
          variant={source ? 'secondary' : 'outline'}
          size="sm"
          onClick={toggleSource}
          aria-pressed={source}
          data-testid="wiki-source-toggle"
          title={t.wikiDoc.editor.sourceHint}
        >
          {t.wikiDoc.editor.source}
        </Button>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            data-testid="wiki-cancel"
            title={t.wikiDoc.editor.cancelHint}
          >
            {t.wikiDoc.editor.cancel}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => void save()}
            disabled={saving || lockReason !== null || changedOnDisk}
            title={
              lockReason ??
              (changedOnDisk ? t.wikiDoc.editor.staleBlocked : null) ??
              t.wikiDoc.editor.saveHint(isMacKeys ? '⌘S' : 'Ctrl+S')
            }
            data-testid="wiki-save"
          >
            {saving ? t.wikiDoc.editor.saving : t.wikiDoc.editor.save}
          </Button>
        </div>
      </div>
      {editTarget && (
        <InlineEditBar
          key={`${editTarget.from}:${editTarget.to}`}
          rel={rel}
          target={editTarget}
          docText={() => getTextRef.current()}
          onAccept={acceptAiEdit}
          onClose={() => {
            setEditTarget(null)
            viewRef.current?.focus()
          }}
        />
      )}
      {lockReason && (
        <div
          role="status"
          className="text-warning-foreground bg-muted px-4 py-2 text-caption"
          data-testid="wiki-edit-lock"
        >
          {lockReason}
        </div>
      )}
      {changedOnDisk && (
        <div
          className="bg-muted flex flex-wrap items-center gap-2 px-4 py-2 text-caption"
          data-testid="wiki-edit-stale"
        >
          <span role="alert" className="text-warning-foreground">
            {t.wikiDoc.editor.stale}
          </span>
          <Button variant="outline" size="sm" data-testid="wiki-edit-copy" onClick={copyMine}>
            {copied ? t.wikiDoc.editor.copied : t.wikiDoc.editor.copy}
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="wiki-edit-stale-reload"
            onClick={onCancel}
          >
            {t.wikiDoc.editor.reload}
          </Button>
        </div>
      )}
      {error && (
        <div
          className="bg-muted flex flex-wrap items-center gap-2 px-4 py-2"
          data-testid="wiki-edit-error"
        >
          <ErrorNote error={error} />
          <Button variant="outline" size="sm" data-testid="wiki-edit-error-copy" onClick={copyMine}>
            {copied ? t.wikiDoc.editor.copied : t.wikiDoc.editor.copy}
          </Button>
          <Button variant="outline" size="sm" data-testid="wiki-edit-reload" onClick={onCancel}>
            {t.wikiDoc.editor.reload}
          </Button>
        </div>
      )}
      <div
        ref={hostRef}
        // 편집기가 칸 전체를 채워야 글 아래 빈 곳을 눌러도 커서가 들어간다
        className={`live-preview min-h-0 flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-editor.cm-focused]:outline-none ${source ? 'live-preview-source' : ''}`}
        data-testid="wiki-editor-source"
      />
      <EditorCount text={text} selected={selected} />
    </div>
  )
}
