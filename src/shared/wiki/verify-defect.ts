// 병합 전 검증(src/main/verify/vault-verify.ts — vault_verify.py 이식) 결함 한 줄을 화면 말로 읽는다 — 어느 페이지의 몇째 줄이고 무엇을 고칠지.
// 결함 문구는 원본 스크립트와 같은 영어 문구다. 원문은 그대로 두고, 알려진 모양에만 고칠 방법을 붙인다.

// 결함 문구 안의 첫 위키 경로(와 줄 번호) — 앞이 줄 시작·공백·괄호일 때만.
// raw/wiki/…·Clippings/wiki/… 같은 하위 경로는 위키 페이지가 아니다
import { currentT, type Messages } from '../i18n'

const WIKI_REL = /(?:^|[\s(])(wiki\/[^\s:,'"]+\.md)(?::(\d+))?/

export type VerifyDefect = {
  rel: string | null
  line: number | null
  /** 무엇을 고칠지 — 사용자 말 */
  fix: string
  /** 원문 — 앞머리 `경로:줄` 은 rel·line 으로 따로 보이므로 뺀다 */
  message: string
}

// 위에서부터 처음 맞는 것 — 원문은 vault-verify.ts(= vault_verify.py) 의 결함 문구
type FixKey = Exclude<keyof Messages['verifyDefect'], 'fallback'>

const FIXES: [RegExp, FixKey][] = [
  [/tab used for indentation/, 'tabIndent'],
  [/duplicate key/, 'duplicateKey'],
  [/sequence item is indented under/, 'listUnderValue'],
  [/frontmatter/, 'frontmatter'],
  [/next_action .* uses ';'/, 'nextActionJoined'],
  [/next_action .* is \d+ bytes/, 'nextActionLong'],
  [/next_action must be/, 'nextActionShape'],
  [/VAULT_MEMORY\.md is missing/, 'memoryMissing'],
  [/must stay under/, 'memoryLong'],
  [/never appended/, 'memoryRepeated'],
  [/line is \d+ bytes/, 'memoryLineLong'],
  [/run-log|lint report/, 'runLogMissing'],
  [/append-only violation/, 'originalChanged']
]

export const readDefect = (defect: string): VerifyDefect => {
  const t = currentT().verifyDefect
  const match = WIKI_REL.exec(defect)
  return {
    rel: match?.[1] ?? null,
    line: match?.[2] ? Number(match[2]) : null,
    fix: t[FIXES.find(([pattern]) => pattern.test(defect))?.[1] ?? 'fallback'],
    message: match?.index === 0 ? defect.slice(match[0].length).replace(/^[\s:]+/, '') : defect
  }
}
