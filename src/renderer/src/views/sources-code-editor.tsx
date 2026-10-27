import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { css } from '@codemirror/lang-css'
import { xml } from '@codemirror/lang-xml'
import { cpp } from '@codemirror/lang-cpp'
import { useStage } from '../lib/use-stage'
import { codeHighlight } from '../lib/code-highlight'
import type { EditableCodeLang } from '../lib/code-lang'

const EDIT_LANGS: Record<EditableCodeLang, () => Extension> = {
  plain: () => [],
  python,
  sql,
  css,
  xml,
  cpp,
  javascript: () => javascript({ jsx: true }),
  typescript: () => javascript({ jsx: true, typescript: true })
}

// 글·코드 파일 편집 칸 — 읽기 칸과 같은 줄번호·접기·구문 색에 쓰는 손을 얹는다.
// 값은 부모가 뷰에서 직접 읽는다(viewRef). 바뀜은 onDirtyChange 로 알린다.
export const CodeEditor = ({
  initialText,
  lang,
  viewRef,
  onDirtyChange,
  onSave
}: {
  initialText: string
  lang: EditableCodeLang
  viewRef: React.MutableRefObject<EditorView | null>
  onDirtyChange: (dirty: boolean) => void
  onSave: () => void
}): React.JSX.Element => {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const stage = useStage()
  // 매 렌더의 콜백을 이펙트에서 잡아 둔다 — 렌더 중 ref 쓰기는 금지다
  const saveRef = useRef(onSave)
  const dirtyRef = useRef(onDirtyChange)
  useEffect(() => {
    saveRef.current = onSave
    dirtyRef.current = onDirtyChange
  })

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current ?? undefined,
      state: EditorState.create({
        doc: initialText,
        extensions: [
          basicSetup,
          EDIT_LANGS[lang](),
          codeHighlight(stage),
          EditorView.lineWrapping,
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                saveRef.current()
                return true
              }
            }
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              dirtyRef.current(update.state.doc.toString() !== initialText)
            }
          })
        ]
      })
    })
    viewRef.current = view
    return () => {
      viewRef.current = null
      view.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText, lang, stage])

  return (
    <div ref={hostRef} className="min-h-0 flex-1 text-callout" data-testid="sources-code-editor" />
  )
}
