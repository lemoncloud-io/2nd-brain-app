#!/usr/bin/env node
// 사전 밖에 남은 화면 문구를 센다 — 문자열·템플릿·JSX 텍스트 안의 한글. 주석·정규식 리터럴은 세지 않는다.
// 한국어 사전(src/shared/i18n/ko)·테스트는 대상이 아니다. 화면 문구가 아닌 한글(AI 프롬프트·볼트에 쓰는 내용·입력 규칙)은
// scripts/ui-hangul-allow.json 에 파일째 사유와 함께 두거나, 그 줄 또는 바로 위 줄에 `ui-hangul-ignore: <사유>` 를 단다.
// 선언·속성 바로 앞 주석에 달면 그 선언 전체(여러 줄 프롬프트 등)를 건너뛴다.
//
//   node scripts/ui-hangul.mjs <파일|폴더>...   → 찾은 줄들 + 끝줄 `ui-hangul: N literals in M files (scanned K)`.
//   N > 0 이면 exit 1, 본 파일이 없으면 exit 2. `pnpm lint` 가 src 전체를 본다
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'

// 선언·속성 앞 주석의 표시는 그 선언 아래 전부를 덮는다 — 문장·JSX 전체를 숨기지 않게 종류를 좁힌다
const COVERS = new Set([
  ts.SyntaxKind.VariableStatement,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.PropertyAssignment
])

const ROOT = join(import.meta.dirname, '..')
const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/
// 사유 없는 표시는 표시가 아니다
const IGNORE = /ui-hangul-ignore:\s*\S/
const DICTIONARY = 'src/shared/i18n/ko/'
const allow = JSON.parse(readFileSync(join(import.meta.dirname, 'ui-hangul-allow.json'), 'utf8'))

const posix = (path) => relative(ROOT, path).split(sep).join('/')

const isSource = (rel) =>
  /\.(ts|tsx)$/.test(rel) &&
  !/\.test\.tsx?$/.test(rel) &&
  !rel.endsWith('.d.ts') &&
  !rel.startsWith(DICTIONARY) &&
  !(rel in allow.files)

const walk = (path) => {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path).flatMap((name) => walk(join(path, name)))
}

const TEXT_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText
])

const scan = (file) => {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const hits = []
  const marked = (node) =>
    COVERS.has(node.kind) &&
    (ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []).some((range) =>
      IGNORE.test(text.slice(range.pos, range.end))
    )
  const visit = (node) => {
    if (node !== source && marked(node)) return
    // 원문(getText)과 값(text)을 둘 다 본다 — `\uD55C` 처럼 이스케이프로 쓴 한글은 값에만 있다
    const raw = TEXT_KINDS.has(node.kind) ? node.getText(source) : ''
    if (raw && (HANGUL.test(raw) || HANGUL.test(node.text ?? ''))) {
      // 줄은 한글이 있는 자리에서 센다 — JSX 텍스트는 앞 줄바꿈부터 시작한다
      const at = Math.max(raw.search(HANGUL), raw.search(/\S/), 0)
      const line = source.getLineAndCharacterOfPosition(node.getStart(source) + at).line
      const ignored = IGNORE.test(lines[line] ?? '') || IGNORE.test(lines[line - 1] ?? '')
      if (!ignored) hits.push({ line: line + 1, text: raw.trim().slice(0, 60) })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return hits
}

const targets = process.argv.slice(2)
if (targets.length === 0) {
  console.error('usage: node scripts/ui-hangul.mjs <file|dir>...')
  process.exit(2)
}

let total = 0
let files = 0
let scanned = 0
for (const file of targets.flatMap((t) => walk(join(ROOT, t)))) {
  const rel = posix(file)
  if (!isSource(rel)) continue
  scanned += 1
  const hits = scan(file)
  if (hits.length === 0) continue
  files += 1
  total += hits.length
  for (const hit of hits) console.log(`${rel}:${hit.line}: ${hit.text}`)
}
// 하나도 안 봤으면 0 은 거짓 green 이다 — 경로 오타·이름 바뀐 폴더·허용 목록이 전부 덮은 경우
if (scanned === 0) {
  console.error('ui-hangul: no source files scanned — check the paths')
  process.exit(2)
}
console.log(`ui-hangul: ${total} literals in ${files} files (scanned ${scanned})`)
process.exit(total === 0 ? 0 : 1)
