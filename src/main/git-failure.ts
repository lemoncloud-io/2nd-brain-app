import type { GitFailure } from './git'

// git stderr 한 줄 판정 — 세 창구(올리기·가져오기·받기)가 같은 표를 쓰고, 할 일 문장만 각자 쓴다.
// 문장을 창구마다 따로 두는 이유: "다시 올린다" 와 "다시 받는다" 는 다른 말이고, 사람은 그 말을 읽는다.
/** login = 로그인하지 않아 띄우지 않았다 · auth = 로그인은 있는데 GitHub 가 받지 않았다(토큰이 풀렸다) */
export type GitFailureKind = 'login' | 'auth' | 'not-found' | 'offline' | 'rejected' | 'unknown'

const PATTERNS: [GitFailureKind, RegExp][] = [
  ['auth', /authentication failed|could not read username|terminal prompts disabled/i],
  // `push --porcelain` 은 `[rejected]` 를 stdout 에 쓴다 — stderr 에는 hint 의 "Updates were rejected" 만 남는다
  ['rejected', /\[rejected\]|non-fast-forward|fetch first|updates were rejected/i],
  [
    'offline',
    /could not resolve host|unable to access|timed out|connection refused|could not read from remote repository/i
  ],
  // 권한 거부는 "없는 저장소" 와 같은 말로 답한다 — 남의 비공개 저장소는 로그인해도 404 로 보인다
  [
    'not-found',
    /repository not found|does not appear to be a git repository|does not exist|not found|permission denied|403/i
  ]
]

export const classifyGitFailure = (stderr: string): GitFailureKind =>
  PATTERNS.find(([, pattern]) => pattern.test(stderr))?.[0] ?? 'unknown'

/** 실패한 실행의 판정 — 로그인하지 않아 띄우지도 않은 것(`login`)은 stderr 를 볼 것도 없다 */
export const failureKind = (run: GitFailure): GitFailureKind =>
  run.failure === 'login' ? 'login' : classifyGitFailure(run.stderr)

/** 판정에 없는 실패는 git 이 한 마지막 말을 그대로 덧붙인다 */
export const lastStderrLine = (stderr: string): string => {
  const last = stderr.trim().split('\n').at(-1)
  return last ? ` — ${last}` : ''
}
