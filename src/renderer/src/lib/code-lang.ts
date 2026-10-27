export type CodeLang =
  'json' | 'html' | 'yaml' | 'javascript' | 'typescript' | 'python' | 'sql' | 'css' | 'xml' | 'cpp'

export type EditableCodeLang = Exclude<CodeLang, 'json' | 'html' | 'yaml'> | 'plain'

/** 고칠 수 있는 글·코드의 편집 언어. json·html·yaml 은 읽기 전용이라 여기 오지 않는다 */
export const editLangFor = (ext: string, kind: string): EditableCodeLang | null => {
  const lang = codeLangFor(ext)
  if (lang === 'json' || lang === 'html' || lang === 'yaml' || lang === null) {
    return kind === 'text' ? 'plain' : null
  }
  return lang
}

/** 코드 확장자 → 구문 색 언어. 여기 없는 확장자는 글자 그대로(TxtPreview) 읽는다 */
export const codeLangFor = (ext: string): CodeLang | null => {
  switch (ext) {
    case '.js':
    case '.mjs':
    case '.cjs':
    case '.jsx':
      return 'javascript'
    case '.ts':
    case '.mts':
    case '.cts':
    case '.tsx':
      return 'typescript'
    case '.py':
      return 'python'
    case '.sql':
      return 'sql'
    case '.css':
    case '.scss':
    case '.less':
      return 'css'
    case '.xml':
      return 'xml'
    case '.c':
    case '.h':
    case '.cpp':
    case '.hpp':
    case '.cc':
      return 'cpp'
    default:
      return null
  }
}
