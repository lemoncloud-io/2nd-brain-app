// json·html·yaml·코드 원문 보기 — 읽기전용 CodeMirror 6(편집기와 같은 계열, 줄번호·접기·구문 색).
// 글자는 vault:// 로 받는다. json 은 읽기 좋게 들여쓰기를 다시 매기고, 깨진 json 은 원문 그대로 둔다.
import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { yaml } from '@codemirror/lang-yaml'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { css } from '@codemirror/lang-css'
import { xml } from '@codemirror/lang-xml'
import { cpp } from '@codemirror/lang-cpp'
import { useVaultText } from '../lib/use-vault-text'
import { ErrorNote } from '../components/error-note'
import { prettyJson } from '../lib/pretty-json'
import { type CodeLang } from '../lib/code-lang'
import { useStage } from '../lib/use-stage'
import { codeHighlight } from '../lib/code-highlight'
import { useT } from '../lib/i18n'

const LANGS = {
  json,
  html,
  yaml,
  python,
  sql,
  css,
  xml,
  cpp,
  javascript: () => javascript({ jsx: true }),
  typescript: () => javascript({ jsx: true, typescript: true })
} as const

export const CodeView = ({ text, lang }: { text: string; lang: CodeLang }): React.JSX.Element => {
  const hostRef = useRef<HTMLDivElement | null>(null)
  // 무대(밝음·어두움)에 맞는 구문 색 — 읽기전용이라 바뀌면 뷰를 다시 만든다
  const stage = useStage()

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current ?? undefined,
      state: EditorState.create({
        doc: text,
        extensions: [
          basicSetup,
          LANGS[lang](),
          codeHighlight(stage),
          EditorView.lineWrapping,
          EditorState.readOnly.of(true),
          // 읽기전용이라 커서도 두지 않는다 — 고를 수는 있다
          EditorView.editable.of(false)
        ]
      })
    })
    return () => view.destroy()
  }, [text, lang, stage])

  return <div ref={hostRef} className="text-callout" data-testid="sources-code" />
}

export const CodePreview = ({ rel, lang }: { rel: string; lang: CodeLang }): React.JSX.Element => {
  const t = useT()
  const { text, error } = useVaultText(rel)
  if (error) return <ErrorNote error={error} className="p-4" />
  if (text === null)
    return <p className="p-4 text-caption text-muted-foreground">{t.preview.loading}</p>

  const shown = lang === 'json' ? prettyJson(text) : { text, broken: false }
  return (
    <div className="flex min-h-0 flex-col">
      {shown.broken && (
        <p
          className="px-4 py-2 text-caption text-muted-foreground"
          data-testid="sources-json-invalid"
        >
          {t.sourceView.code.notJson}
        </p>
      )}
      {shown.tooBig && (
        <p className="px-4 py-2 text-caption text-muted-foreground" data-testid="sources-json-big">
          {t.sourceView.code.tooBig}
        </p>
      )}
      <CodeView text={shown.text} lang={lang} />
    </div>
  )
}
