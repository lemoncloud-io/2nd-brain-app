import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Download, ExternalLink, LoaderCircle, LogIn, LogOut, RefreshCw } from 'lucide-react'
import type { InstallResult } from '../../../../shared/ipc-contract'
import type { EngineKind } from '../../../../shared/engine-settings'
import { ENGINE_META, ENGINE_NAME, installGuide } from '../../lib/install-guide'
import { usePoll } from '../../hooks/use-poll'
import { useViewVisible } from '../layout/view-id'
import { useSetup } from '../../hooks/use-setup'
import { Button } from '../ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle
} from '../ui/alert-dialog'
import { CopyCommand } from './copy-command'
import { ErrorNote } from '../error-note'
import { switchEngine as saveEngine } from '../../lib/engine-settings-sync'
import { toUserError, type UserError } from '../../lib/user-error'
import { usePlatform } from '../../hooks/use-platform'
import { clearEngineLimit, engineLimit, subscribeEngineLimit } from '../../lib/engine-limit'
import { getT, useT } from '../../lib/i18n'

// 설치를 기다릴 때는 3초, 로그인은 2초 — 둘 다 10분이면 멈추고 "다시 확인" 을 남긴다
const INSTALL_POLL = { intervalMs: 3000, limitMs: 10 * 60_000 }
const LOGIN_POLL = { intervalMs: 2000, limitMs: 10 * 60_000 }

/** 설치 실패를 사용자가 다음에 할 일로 옮긴다. cancelled 는 앱이 꺼지는 중이라 보일 화면이 없다 */
const installFailure = (
  result: Extract<InstallResult, { ok: false }>,
  name: string
): UserError | null => {
  if (result.reason === 'cancelled') return null
  if (result.reason === 'timeout') {
    return { text: getT().engineConnect.installTimeout(name), detail: null }
  }
  if (result.reason === 'not-found') {
    return {
      text: getT().engineConnect.installNotFound(name),
      detail: result.detail || null
    }
  }
  return {
    text: getT().engineConnect.installFailed(name),
    detail: result.detail || null
  }
}

/**
 * 엔진 연결 — 설치 안 됐으면 설치 버튼(안 되면 OS 별 한 줄 직접 설치 안내), 로그인 안 됐으면 브라우저 로그인, 되면 계정과 끊는 길.
 * 설치·로그인을 기다리는 동안 상태를 스스로 다시 묻는다 — 사용자가 "확인" 을 누르지 않아도 넘어간다.
 * 기다림을 포기하면 그 사실을 말한다: 스피너를 계속 돌리면 화면이 거짓말을 한다.
 * 시작하기와 설정이 같이 쓴다.
 */
export const EngineConnect = ({ compact = false }: { compact?: boolean }): React.JSX.Element => {
  const t = useT()
  const { engine, engineKind, engineStatus, refresh } = useSetup()
  const platform = usePlatform()
  const [loginClicked, setLoginClicked] = useState(false)
  const [loginError, setLoginError] = useState<UserError | null>(null)
  const [loginStalled, setLoginStalled] = useState(false)
  const [loginOpening, setLoginOpening] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<UserError | null>(null)
  const [installStalled, setInstallStalled] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installLine, setInstallLine] = useState('')
  const [installError, setInstallError] = useState<UserError | null>(null)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<UserError | null>(null)
  const name = ENGINE_NAME[engineKind]
  // 한도에 걸린 계정을 "연결됨" 이라고만 부르면, 왜 아무것도 안 되는지 물으러 온 사람이 빈손으로 돌아간다
  const limit = useSyncExternalStore(subscribeEngineLimit, engineLimit)

  // 로그인 버튼을 누른 뒤 아직 미로그인인 동안만 기다린다 — 로그인되면 저절로 풀린다
  const loginStarted = loginClicked && engine === 'logged-out'

  // 기다림을 포기한 시점 — 증상표를 접힌 채 두지 않고 펼쳐 준다
  const stall = useCallback(() => setInstallStalled(true), [])
  const loginStall = useCallback(() => setLoginStalled(true), [])

  // 시작하기와 설정이 둘 다 마운트돼 있다 — 보이는 쪽만 묻는다
  const visible = useViewVisible()
  // 앱이 설치하는 동안은 묻지 않는다 — 설치가 끝나면 그 결과가 곧 답이다
  usePoll(visible && engine === 'missing' && !installing, refresh, INSTALL_POLL, stall)
  usePoll(visible && loginStarted && !loginStalled, refresh, LOGIN_POLL, loginStall)

  // 설치를 누르기 전에 듣고 있어야 첫 줄을 놓치지 않는다 — 보일지는 installing 이 정한다.
  // 안 보이는 인스턴스는 듣지 않는다 — 진행 줄은 초당 최대 10회라 숨은 쪽까지 리렌더할 이유가 없다
  useEffect(() => (visible ? window.api.onInstallEvent(setInstallLine) : undefined), [visible])

  const install = (): void => {
    setInstalling(true)
    setInstallLine('')
    setInstallError(null)
    window.api
      .installEngine()
      .then((result) => {
        if (!result.ok) setInstallError(installFailure(result, name))
      })
      .catch((error: unknown) =>
        setInstallError(toUserError(error, getT().engineConnect.installStartFailed))
      )
      .finally(() => {
        setInstalling(false)
        refresh()
      })
  }

  const login = (): void => {
    setLoginError(null)
    setLoginStalled(false)
    setLoginClicked(true)
    setLoginOpening(true)
    clearEngineLimit()
    window.api
      .startEngineLogin()
      .catch((error: unknown) => {
        setLoginClicked(false)
        setLoginError(toUserError(error, getT().engineConnect.loginOpenFailed))
      })
      .finally(() => setLoginOpening(false))
  }

  const logout = (): void => {
    setConfirmLogout(false)
    setLoggingOut(true)
    setLogoutError(null)
    window.api
      .logoutEngine()
      .then((status) => {
        setLoginClicked(false)
        setLoginStalled(false)
        clearEngineLimit()
        // 끊었다는데 여전히 로그인으로 읽히면 조용히 "연결됨" 으로 돌아간다 — 그것을 말한다
        if (status.auth.loggedIn) {
          setLogoutError({
            text: getT().engineConnect.stillLoggedIn(name),
            detail: null
          })
        }
      })
      .catch((e: unknown) => setLogoutError(toUserError(e, getT().engineConnect.logoutFailed)))
      // 실패해도 실제로는 끊겼을 수 있다 — 화면을 옛 상태로 두지 않는다
      .finally(() => {
        setLoggingOut(false)
        refresh()
      })
  }

  const switchEngine = useCallback(
    (kind: EngineKind): void => {
      setSwitching(true)
      setSwitchError(null)
      saveEngine(kind)
        .then(refresh)
        // 조용히 실패하면 버튼이 아무 일도 안 한 것으로 보인다
        .catch((e: unknown) => setSwitchError(toUserError(e, getT().engineConnect.switchFailed)))
        .finally(() => setSwitching(false))
    },
    [refresh]
  )

  const other: EngineKind = engineKind === 'claude' ? 'codex' : 'claude'
  // 설정에서도 AI 를 바꿀 수 있어야 한다 — 숨기면 아래 "엔진" 칸까지 내려가 따로 저장해야 한다
  const switcher = (
    <Button
      variant="link"
      size="sm"
      className="h-auto self-start px-0"
      data-testid={`engine-switch:${other}`}
      disabled={switching}
      onClick={() => switchEngine(other)}
    >
      {t.engineConnect.switchTo(ENGINE_META[other].account, ENGINE_NAME[other])}
    </Button>
  )
  // 구독 가입 링크 — 없음·로그인 대기 두 자리에서 같은 말로 쓴다
  const joinLink = (
    <p className="text-caption text-muted-foreground">
      {t.engineConnect.joinPrefix}{' '}
      <a
        href={ENGINE_META[engineKind].joinUrl}
        target="_blank"
        rel="noreferrer"
        data-testid="engine-join"
        className="focus-ring rounded-sm text-primary-ink underline-offset-4 hover:underline"
      >
        {t.engineConnect.join(ENGINE_META[engineKind].plan)}
      </a>
    </p>
  )
  const switchNote = switchError ? (
    <ErrorNote error={switchError} testId="engine-switch-error" />
  ) : null

  if (engine === 'checking') {
    return (
      <p
        data-testid="engine-connect"
        data-state="checking"
        className="text-callout text-muted-foreground"
      >
        {t.engineConnect.checking(name)}
      </p>
    )
  }

  if (engine === 'ok' && engineStatus && !('missing' in engineStatus.cli)) {
    // 계정은 이메일뿐이다 — 로그인 방식("ChatGPT")을 계정 이름처럼 쓰면 모른다고 적어 둔 아래 줄과 모순된다
    const account = engineStatus.auth.email ?? null
    const via = engineStatus.auth.authMethod ?? null
    return (
      <div data-testid="engine-connect" data-state="ok" className="flex flex-col gap-2">
        <p className="min-w-0 wrap-anywhere text-callout text-label">
          {t.engineConnect.connected(name)}
          {account ? ` · ${account}` : via ? ` · ${t.engineConnect.viaLogin(via)}` : ''}
          {/* 버전은 도움을 청할 때만 쓸 값이다 — 화면에 늘 두지 않는다 */}
          <span className="sr-only">{t.engineConnect.version(engineStatus.cli.version)}</span>
        </p>
        {limit && (
          <p
            role="status"
            data-testid="engine-limit"
            className="text-caption text-muted-foreground"
          >
            {t.engineConnect.limitPrefix}{' '}
            {limit.at === null ? t.engineConnect.limitSoon : t.engineConnect.limitAt(limit.at)}
            {t.engineConnect.limitSuffix}
          </p>
        )}
        {/* 계정을 확인할 길이 없는 엔진이 있다 — 모르는 것을 아는 척하지 않는다 */}
        {!account && (
          <p className="text-caption text-muted-foreground">
            {t.engineConnect.accountUnknown(ENGINE_META[engineKind].account)}
          </p>
        )}
        <div>
          <Button
            size="sm"
            variant="outline"
            data-testid="engine-logout"
            disabled={loggingOut}
            onClick={() => setConfirmLogout(true)}
          >
            <LogOut aria-hidden /> {t.engineConnect.logout}
          </Button>
        </div>
        {logoutError && <ErrorNote error={logoutError} testId="engine-logout-error" />}
        {!compact && switcher}
        {switchNote}
        <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
          <AlertDialogContent data-testid="engine-logout-confirm">
            <AlertDialogTitle>{t.engineConnect.logoutTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.engineConnect.logoutDetail(account, name)}
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.engineConnect.keep}</AlertDialogCancel>
              <AlertDialogAction data-testid="engine-logout-confirm-ok" onClick={logout}>
                {t.engineConnect.logout}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  if (engine === 'missing') {
    const guide = installGuide(engineKind, platform ?? 'darwin')
    return (
      <div data-testid="engine-connect" data-state="missing" className="flex flex-col gap-3">
        <p className="text-callout text-label">
          {t.engineConnect.missingIntro(name, ENGINE_META[engineKind].account)}
        </p>
        {joinLink}
        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            className="self-start"
            data-testid="engine-install"
            disabled={installing}
            onClick={install}
          >
            {installing ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Download aria-hidden />
            )}
            {installing
              ? t.engineConnect.installing
              : installError
                ? t.engineConnect.retry
                : t.engineConnect.install(name)}
          </Button>
          {installing && (
            <p
              role="status"
              data-testid="engine-install-progress"
              // 한 줄로 자른다 — 잘린 나머지는 툴팁으로 읽는다
              title={installLine || undefined}
              className="truncate text-caption text-muted-foreground"
            >
              {installLine || t.engineConnect.installDownloading}
            </p>
          )}
          {installError && <ErrorNote error={installError} testId="engine-install-error" />}
        </div>
        {installStalled && !installing && (
          <p role="status" className="text-caption text-muted-foreground">
            {t.engineConnect.installStalled(name)}
          </p>
        )}
        <details
          data-testid="engine-install-manual"
          open={installStalled || installError !== null}
          className="border-border rounded-md border px-3 py-2"
        >
          <summary className="focus-ring cursor-pointer rounded-sm text-caption text-label">
            {t.engineConnect.manual}
          </summary>
          <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 text-callout text-label marker:text-muted-foreground">
            <li>{guide.terminal}</li>
            <li>
              {t.install.paste}
              {platform && (
                <div className="mt-1.5">
                  <CopyCommand command={guide.command} testId="engine-install-command" />
                </div>
              )}
            </li>
            <li>{t.engineConnect.manualDone}</li>
          </ol>
          <p className="mt-2 text-caption text-muted-foreground">{t.install.trust}</p>
          <p data-testid="engine-install-hints" className="mt-3 text-caption text-label">
            {t.engineConnect.manualHints(installError !== null)}
          </p>
          <dl className="mt-1 flex flex-col gap-2">
            {guide.hints.map((hint) => (
              <div key={hint.symptom}>
                <dt className="wrap-anywhere text-caption text-label">{hint.symptom}</dt>
                <dd className="text-caption text-muted-foreground">{hint.fix}</dd>
              </div>
            ))}
          </dl>
        </details>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Button size="sm" variant="outline" data-testid="engine-recheck" onClick={refresh}>
            <RefreshCw aria-hidden /> {t.engineConnect.recheck}
          </Button>
          <a
            href={guide.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex items-center gap-1 rounded-sm text-caption text-primary-ink underline-offset-4 hover:underline"
          >
            {t.engineConnect.docs} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
        {switcher}
        {switchNote}
      </div>
    )
  }

  // 설치본이 로그인 상태를 알려 주지 않는다 — 로그인 버튼을 보이면 통하지 않는 버튼을 무한히 누르게 된다
  if (engine === 'unreadable') {
    const guide = installGuide(engineKind, platform ?? 'darwin')
    return (
      <div data-testid="engine-connect" data-state="unreadable" className="flex flex-col gap-3">
        <p className="text-callout text-label">{t.engineConnect.unreadable(name)}</p>
        {platform && <CopyCommand command={guide.command} testId="engine-install-command" />}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Button size="sm" variant="outline" data-testid="engine-recheck" onClick={refresh}>
            <RefreshCw aria-hidden /> {t.engineConnect.recheck}
          </Button>
          <a
            href={guide.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex items-center gap-1 rounded-sm text-caption text-primary-ink underline-offset-4 hover:underline"
          >
            {t.engineConnect.docs} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
        {switcher}
        {switchNote}
      </div>
    )
  }

  return (
    <div data-testid="engine-connect" data-state="logged-out" className="flex flex-col gap-3">
      <p className="text-callout text-label">
        {t.engineConnect.loginIntro(ENGINE_META[engineKind].account)}
      </p>
      {joinLink}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant={loginStarted ? 'outline' : 'default'}
          data-testid="engine-login"
          disabled={loginOpening}
          onClick={login}
        >
          <LogIn aria-hidden />
          {loginStarted ? t.engineConnect.loginReopen : t.engineConnect.loginBrowser}
        </Button>
        {loginStarted && (
          <Button size="sm" variant="ghost" data-testid="engine-recheck" onClick={refresh}>
            <RefreshCw aria-hidden /> {t.engineConnect.recheck}
          </Button>
        )}
      </div>
      {loginStarted &&
        (loginStalled ? (
          <p
            role="status"
            data-testid="engine-login-stalled"
            className="text-caption text-muted-foreground"
          >
            {t.engineConnect.loginStalled}
          </p>
        ) : (
          <p role="status" className="flex items-center gap-2 text-caption text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            {t.engineConnect.loginWaiting}
          </p>
        ))}
      {loginError && <ErrorNote error={loginError} />}
      {switcher}
      {switchNote}
    </div>
  )
}
