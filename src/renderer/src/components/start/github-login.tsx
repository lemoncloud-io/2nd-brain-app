// GitHub 로그인 — 앱이 보여 준 여덟 글자를 브라우저에 넣고 승인하면 끝난다.
// 비밀번호도 토큰도 손으로 만들지 않는다. 팀 저장소 올리기·받기·팀 보관함에 들어가기와 팀 확인 요청이 모두 이 로그인 하나를 쓴다.
import { useRef, useState } from 'react'
import { Check, Copy, ExternalLink, LoaderCircle, LogIn, LogOut } from 'lucide-react'
import { Button } from '../ui/button'
import { ErrorNote } from '../error-note'
import { toUserError, type UserError } from '../../lib/user-error'
import { useSetup } from '../../hooks/use-setup'
import { getT, useT } from '../../lib/i18n'

type Waiting = { userCode: string; verificationUri: string }

export const GithubLogin = ({
  onLater
}: {
  /** 첫 실행 시작하기의 필수 단계 — 있으면 내 GitHub 에 올린다는 문구와 "나중에 하기" 를 보인다 */
  onLater?: () => void
} = {}): React.JSX.Element => {
  const t = useT()
  // 로그인 상태는 준비 상태 한 곳에 있다 — 이 칸은 설정·시작하기·팀 보관함에 들어가기에 따로 마운트돼 있어,
  // 저마다 들고 있으면 한쪽에서 로그인해도 다른 쪽은 로그인 전으로 남는다.
  // 로그인이 바뀌면 받기 줄도 바뀐다("다시 연결이 필요해요" ↔ 받기) — refreshGithub 이 팀 변경도 다시 받는다
  const { github, refreshGithub, error: setupError } = useSetup()
  const loggedIn = github?.loggedIn ?? null
  const account = github?.login
  const [waiting, setWaiting] = useState<Waiting | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<UserError | null>(null)
  // 대기 중 취소는 화면만 닫는다 — 브라우저 승인은 그대로 두고, 끝난 결과는 다음 새로고침에 반영된다
  const cancelled = useRef(false)
  // 로그인 시도가 겹치면 옛 시도의 늦은 응답이 화면을 덮지 않게 번호로 가른다
  const attempt = useRef(0)

  const login = (): void => {
    const id = ++attempt.current
    cancelled.current = false
    setError(null)
    window.api
      .githubAuthStart()
      .then((started) => {
        if (id !== attempt.current) return
        if (!started.ok) {
          setError({ text: started.reason, detail: null })
          return
        }
        setWaiting({ userCode: started.userCode, verificationUri: started.verificationUri })
        void window.api.openExternal(started.verificationUri)
        return window.api.githubAuthFinish().then((finished) => {
          if (id !== attempt.current) return
          if (cancelled.current) {
            if (finished.ok) refreshGithub()
            return
          }
          setWaiting(null)
          if (finished.ok) refreshGithub()
          else setError({ text: finished.reason, detail: null })
        })
      })
      .catch((e: unknown) => {
        if (id !== attempt.current) return
        setWaiting(null)
        setError(toUserError(e, getT().vaultSetup.githubLoginFailed))
      })
  }

  const signOut = (): void => {
    window.api
      .githubSignOut()
      .then(refreshGithub)
      .catch((e: unknown) => setError(toUserError(e, getT().vaultSetup.githubLogoutFailed)))
  }

  const laterButton = onLater && (
    <Button size="sm" variant="ghost" data-testid="github-later" onClick={onLater}>
      {t.vaultSetup.later}
    </Button>
  )

  return (
    <div className="flex flex-col gap-3" data-testid="github-login">
      {waiting ? (
        <div className="flex flex-col gap-2">
          <p className="text-callout text-label">{t.vaultSetup.deviceSteps}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code
              data-testid="github-user-code"
              className="rounded-md bg-accent px-3 py-1.5 text-title font-semibold tracking-widest"
            >
              {waiting.userCode}
            </code>
            <Button
              size="sm"
              variant="outline"
              data-testid="github-copy-code"
              onClick={() => {
                void navigator.clipboard.writeText(waiting.userCode)
                setCopied(true)
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}{' '}
              {copied ? t.vaultSetup.copied : t.vaultSetup.copyCode}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="github-open-verify"
              onClick={() => void window.api.openExternal(waiting.verificationUri)}
            >
              <ExternalLink aria-hidden /> {t.vaultSetup.openVerify}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="github-cancel"
              onClick={() => {
                cancelled.current = true
                setWaiting(null)
              }}
            >
              {t.vaultSetup.cancel}
            </Button>
          </div>
          <p role="status" className="flex items-center gap-2 text-caption text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />{' '}
            {t.vaultSetup.waitingApproval}
          </p>
          <p data-testid="github-wait-limit" className="text-caption text-muted-foreground">
            {t.vaultSetup.codeExpiry}
          </p>
        </div>
      ) : loggedIn === null ? (
        // 아직 모른다 — 로그인 전과 같은 화면을 그리면 이미 로그인한 사람에게 로그인하라고 말한다
        setupError ? (
          <div className="flex flex-col gap-2">
            <ErrorNote error={setupError} testId="github-login-state-error" />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={refreshGithub}>
                {t.vaultSetup.recheck}
              </Button>
              {/* 상태를 못 읽어도 첫 실행이 막히지 않게 — 이 컴퓨터에만 만드는 길은 열어 둔다 */}
              {laterButton}
            </div>
          </div>
        ) : (
          <p role="status" className="text-caption text-muted-foreground">
            {t.vaultSetup.githubChecking}
          </p>
        )
      ) : loggedIn ? (
        <div className="flex flex-wrap items-center gap-3">
          <p data-testid="github-login-state" className="text-callout text-label">
            {t.vaultSetup.githubSignedIn(account ?? null)}
          </p>
          <Button size="sm" variant="ghost" data-testid="github-sign-out" onClick={signOut}>
            <LogOut aria-hidden /> {t.vaultSetup.logout}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p data-testid="github-login-state" className="text-callout text-label">
            {onLater ? t.onboarding.githubRequired : t.vaultSetup.githubNeeded}
          </p>
          {onLater && (
            <p data-testid="github-private-note" className="text-caption text-muted-foreground">
              {t.onboarding.githubPrivateNote}
            </p>
          )}
          <p className="text-caption text-muted-foreground">
            {t.vaultSetup.noAccount}{' '}
            <a
              href="https://github.com/signup"
              target="_blank"
              rel="noreferrer"
              data-testid="github-signup"
              className="focus-ring rounded-sm text-primary-ink underline-offset-4 hover:underline"
            >
              {t.vaultSetup.signUp}
            </a>{' '}
            {t.vaultSetup.signUpFree}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" data-testid="github-login-start" onClick={login}>
              <LogIn aria-hidden /> {t.vaultSetup.githubLogin}
            </Button>
            {laterButton}
          </div>
          {onLater && (
            <p className="text-caption text-muted-foreground">{t.onboarding.githubLaterNote}</p>
          )}
        </div>
      )}
      {error && <ErrorNote error={error} testId="github-login-error" />}
    </div>
  )
}
