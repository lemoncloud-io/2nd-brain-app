import { useEffect, useId, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CloudUpload,
  ExternalLink,
  LoaderCircle,
  Plus,
  Send,
  Unplug
} from 'lucide-react'
import type {
  GithubFailure,
  GithubOrgs,
  InviteResult,
  PushResult
} from '../../../../shared/ipc-contract'
import { githubUrlHint } from '../../../../shared/github-url'
import { toUserError } from '../../lib/user-error'
import { cn } from '../../lib/utils'
import { useSetup } from '../../hooks/use-setup'
import { aheadFilesText } from '../../lib/sync-text'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle
} from '../ui/alert-dialog'
import { ErrorNote } from '../error-note'
import { GithubLogin } from './github-login'
import { getT, useT } from '../../lib/i18n'

const SIGNUP_URL = 'https://github.com/signup'

const failureNote = (failure: GithubFailure): { text: string; detail: string | null } => ({
  text: failure.reason,
  detail: failure.detail ?? null
})

type Create = { kind: 'idle' } | { kind: 'running' } | { kind: 'failed'; failure: GithubFailure }

/**
 * 팀 저장소 만들기 — 내 계정이나 내가 속한 조직 아래 비공개 저장소를 만들고, 이 보관함을 연결해 바로 올린다.
 * 혼자 써도 같다(팀원 없는 팀 저장소). 사람은 GitHub 의 새 저장소 화면을 오가지 않는다
 */
const CreateRepo = ({
  onCreated
}: {
  /** 저장소가 생겨 연결까지 됐다(또는 어디까지 됐는지 모른다) — `pushFailed` 는 부모의 올리기 상태 줄이 이어 말할 사유 */
  onCreated: (pushFailed?: string) => void
}): React.JSX.Element => {
  const t = useT()
  const { github } = useSetup()
  const loggedIn = github?.loggedIn === true
  const [orgs, setOrgs] = useState<GithubOrgs | null>(null)
  // '' = 내 계정
  const [owner, setOwner] = useState('')
  const [name, setName] = useState('2nd-brain')
  const [create, setCreate] = useState<Create>({ kind: 'idle' })
  // 조직 목록 다시 읽기 — 일시적인 실패 뒤 사람이 누른다
  const [orgsTry, setOrgsTry] = useState(0)
  const ownerId = useId()
  const nameId = useId()

  // 로그인한 계정이 바뀌면 조직도 다시 읽는다 — 답이 오기 전에 바뀌면 옛 답은 버린다
  useEffect(() => {
    if (!loggedIn) return
    let live = true
    window.api
      .githubOrgs()
      .then((result) => {
        if (live) setOrgs(result)
      })
      .catch((error: unknown) => {
        if (live)
          setOrgs({ ok: false, reason: toUserError(error, getT().teamRepo.orgsFailed).text })
      })
    return () => {
      live = false
      setOrgs(null)
      setOwner('')
    }
  }, [loggedIn, github?.login, orgsTry])

  const running = create.kind === 'running'
  const start = (): void => {
    setCreate({ kind: 'running' })
    window.api
      .createTeamRepo(owner === '' ? null : owner, name.trim())
      .then((result) => {
        setCreate(
          result.ok || result.connected ? { kind: 'idle' } : { kind: 'failed', failure: result }
        )
        if (result.ok) onCreated()
        else if (result.connected) onCreated(result.reason)
      })
      .catch((error: unknown) => {
        // 어디까지 됐는지 모른다 — 문구는 부모의 올리기 상태 줄에 둔다. 연결됐으면 연결됨 화면으로 넘어가도
        // 문구가 남고, 아니면 이 폼 아래에 그대로 보인다
        setCreate({ kind: 'idle' })
        onCreated(toUserError(error, getT().teamRepo.createUnfinished).text)
      })
  }

  return (
    <section data-testid="team-repo-create" className="flex flex-col gap-2">
      <h3 className="text-callout font-semibold">{t.teamRepo.createTitle}</h3>
      <p className="text-caption text-muted-foreground">{t.teamRepo.createIntro}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (loggedIn && !running && name.trim() !== '') start()
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={ownerId} className="text-caption text-muted-foreground">
            {t.teamRepo.owner}
          </label>
          <select
            id={ownerId}
            data-testid="team-repo-owner"
            value={owner}
            disabled={!loggedIn || running}
            onChange={(event) => setOwner(event.target.value)}
            className="focus-ring h-9 rounded-md border border-hairline bg-background px-2 text-callout text-foreground"
          >
            <option value="">{t.teamRepo.myAccount(github?.login ?? null)}</option>
            {orgs?.ok &&
              orgs.orgs.map((org) => (
                <option key={org} value={org}>
                  {t.teamRepo.org(org)}
                </option>
              ))}
          </select>
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <label htmlFor={nameId} className="text-caption text-muted-foreground">
            {t.teamRepo.repoName}
          </label>
          <Input
            id={nameId}
            data-testid="team-repo-name"
            value={name}
            disabled={!loggedIn || running}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          className="h-9"
          data-testid="team-repo-create-start"
          disabled={!loggedIn || running || name.trim() === ''}
        >
          {running ? <LoaderCircle className="animate-spin" aria-hidden /> : <Plus aria-hidden />}{' '}
          {t.teamRepo.createAndUpload}
        </Button>
      </form>
      {!loggedIn && (
        <p className="text-caption text-muted-foreground">
          {t.teamRepo.signInFirst}{' '}
          <a
            href={SIGNUP_URL}
            target="_blank"
            rel="noreferrer"
            className="focus-ring rounded-sm text-primary-ink underline-offset-4 hover:underline"
          >
            {t.teamRepo.signUp}
          </a>{' '}
          {t.teamRepo.signUpFree}
        </p>
      )}
      {orgs && !orgs.ok && (
        <div className="flex flex-wrap items-center gap-2">
          <p data-testid="team-repo-orgs-note" className="text-caption text-muted-foreground">
            {orgs.reason}
          </p>
          {!orgs.relogin && (
            <Button size="sm" variant="ghost" onClick={() => setOrgsTry((n) => n + 1)}>
              {t.teamRepo.reload}
            </Button>
          )}
        </div>
      )}
      {running && (
        <p role="status" className="text-caption text-muted-foreground">
          {t.teamRepo.creating}
        </p>
      )}
      {create.kind === 'failed' && (
        <div className="flex flex-col gap-1">
          <ErrorNote error={failureNote(create.failure)} testId="team-repo-create-error" />
          {create.failure.link && (
            <a
              href={create.failure.link}
              target="_blank"
              rel="noreferrer"
              data-testid="team-repo-create-link"
              className="focus-ring inline-flex items-center gap-1 self-start rounded-sm text-caption text-primary-ink underline-offset-4 hover:underline"
            >
              {t.teamRepo.orgSettings} <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      )}
    </section>
  )
}

type Invite =
  { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; who: string; result: InviteResult }

/** 팀원 초대 — GitHub 아이디로. 팀원은 앱의 팀 보관함에 들어가기에서 수락하고 받는다(GitHub 알림·이메일로도 된다) */
const InviteMember = (): React.JSX.Element => {
  const t = useT()
  const [username, setUsername] = useState('')
  const [invite, setInvite] = useState<Invite>({ kind: 'idle' })
  const inputId = useId()
  const who = username.trim().replace(/^@/, '')

  const send = (): void => {
    setInvite({ kind: 'running' })
    window.api
      .inviteMember(who)
      .then((result) => {
        setInvite({ kind: 'done', who, result })
        if (result.ok) setUsername('')
      })
      .catch((error: unknown) =>
        setInvite({
          kind: 'done',
          who,
          result: { ok: false, reason: toUserError(error, getT().teamRepo.inviteFailed).text }
        })
      )
  }

  return (
    <form
      data-testid="team-invite"
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <label htmlFor={inputId} className="text-callout font-semibold">
        {t.teamRepo.inviteTitle}
      </label>
      <p className="text-caption text-muted-foreground">{t.teamRepo.inviteIntro}</p>
      <div className="flex gap-2">
        <Input
          id={inputId}
          data-testid="team-invite-name"
          placeholder={t.teamRepo.invitePlaceholder}
          spellCheck={false}
          autoComplete="off"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="h-9"
          data-testid="team-invite-send"
          disabled={who === '' || invite.kind === 'running'}
        >
          {invite.kind === 'running' ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <Send aria-hidden />
          )}{' '}
          {t.teamRepo.invite}
        </Button>
      </div>
      {invite.kind === 'done' &&
        (invite.result.ok ? (
          <p role="status" data-testid="team-invite-result" className="text-caption text-label">
            {invite.result.state === 'invited'
              ? t.teamRepo.invited(invite.who)
              : t.teamRepo.alreadyMember(invite.who)}
          </p>
        ) : (
          <ErrorNote error={failureNote(invite.result)} testId="team-invite-result" />
        ))}
    </form>
  )
}

type Push = { state: 'idle' } | { state: 'running' } | { state: 'done'; result: PushResult }

/** 저장소 만들기·연결·올리기·초대 — 보관함이 있을 때만 그린다(`TeamRepo`) */
const RepoConnection = (): React.JSX.Element => {
  const t = useT()
  const { remote, sync, refreshJourney } = useSetup()
  const [url, setUrl] = useState('')
  const [push, setPush] = useState<Push>({ state: 'idle' })
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [changing, setChanging] = useState(false)
  // 이미 만든 빈 저장소 주소로 연결하기 — 만들기가 기본이고 이것은 접어 둔다
  const [pasting, setPasting] = useState(false)
  const pasteId = useId()

  const disconnect = (): void => {
    setConfirmDisconnect(false)
    setDisconnecting(true)
    setPush({ state: 'idle' })
    window.api
      .disconnectRemote()
      // 조용히 실패하면 버튼이 아무 일도 안 한 것으로 보이고, 사용자는 끊긴 줄 안다
      .catch((error: unknown) =>
        setPush({
          state: 'done',
          result: { ok: false, reason: toUserError(error, getT().teamRepo.disconnectFailed).text }
        })
      )
      .finally(() => {
        setDisconnecting(false)
        refreshJourney()
      })
  }

  const run = (action: () => Promise<PushResult>): void => {
    setPush({ state: 'running' })
    action()
      .then((result) => setPush({ state: 'done', result }))
      .catch((error: unknown) =>
        setPush({
          state: 'done',
          result: { ok: false, reason: toUserError(error, getT().teamRepo.pushFailed).text }
        })
      )
      .finally(refreshJourney)
  }

  const status =
    push.state === 'running' ? (
      <p role="status" className="flex items-center gap-2 text-caption text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        {t.teamRepo.pushing}
      </p>
    ) : push.state === 'done' ? (
      push.result.ok ? (
        <p
          role="status"
          data-testid="github-push-result"
          className="flex items-center gap-1.5 text-caption text-label"
        >
          <Check className="size-3.5" aria-hidden /> {t.teamRepo.pushed}
        </p>
      ) : (
        <p role="alert" data-testid="github-push-result" className="text-caption text-destructive">
          {push.result.reason}
        </p>
      )
    ) : null

  if (remote && !changing) {
    return (
      <div data-testid="team-repo" data-state="connected" className="flex flex-col gap-2">
        <p className="min-w-0 wrap-anywhere text-callout text-label">
          {t.teamRepo.connected}{' '}
          <a
            href={remote.webUrl}
            target="_blank"
            rel="noreferrer"
            className="focus-ring rounded-sm text-primary-ink underline-offset-4 hover:underline"
          >
            {remote.webUrl.replace(/^https:\/\//, '')}
          </a>
        </p>
        {/* 공개 저장소면 올라간 문서를 누구나 읽는다 — 확인된 경우에만 말한다(확인 못 했으면 단정하지 않는다) */}
        {remote.public === true && (
          <p
            role="alert"
            data-testid="github-public-warning"
            className="flex items-start gap-1.5 text-caption text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t.teamRepo.publicWarning}
          </p>
        )}
        <p className="text-caption text-muted-foreground">
          {t.teamRepo.uploads(t.review.approveUpload)}
        </p>
        {/* 승인은 팀 확인(PR)을 거친다 — 이 버튼은 그 절차를 건너뛴다. 막지는 않고 먼저 말한다 */}
        <p
          data-testid="github-push-warning"
          className="flex gap-2 text-caption text-muted-foreground"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t.teamRepo.pushWarning}
        </p>
        {aheadFilesText(sync.aheadFiles) && (
          <p data-testid="github-push-files" className="text-caption text-muted-foreground">
            {aheadFilesText(sync.aheadFiles)}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="github-push"
            disabled={push.state === 'running'}
            onClick={() => run(() => window.api.pushRemote())}
          >
            <CloudUpload aria-hidden /> {t.teamRepo.pushNow}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid="github-change"
            onClick={() => {
              setUrl('')
              setPush({ state: 'idle' })
              setChanging(true)
            }}
          >
            {t.teamRepo.change}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid="github-disconnect"
            disabled={disconnecting}
            onClick={() => setConfirmDisconnect(true)}
          >
            <Unplug aria-hidden /> {t.teamRepo.disconnect}
          </Button>
        </div>
        {status}
        <InviteMember />
        <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
          <AlertDialogContent data-testid="github-disconnect-confirm">
            <AlertDialogTitle>{t.teamRepo.disconnectTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.teamRepo.disconnectDetail}</AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.teamRepo.keep}</AlertDialogCancel>
              <AlertDialogAction data-testid="github-disconnect-ok" onClick={disconnect}>
                {t.teamRepo.disconnect}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  const hint = githubUrlHint(url)
  return (
    <div
      data-testid="team-repo"
      data-state={changing ? 'changing' : 'none'}
      className="flex flex-col gap-4"
    >
      <p className="text-caption text-muted-foreground">
        {t.teamRepo.uploadsShort(t.review.approveUpload)}
      </p>
      <CreateRepo
        onCreated={(pushFailed) => {
          setChanging(false)
          setPush({
            state: 'done',
            result: pushFailed === undefined ? { ok: true } : { ok: false, reason: pushFailed }
          })
          refreshJourney()
        }}
      />
      <div className="flex flex-col gap-2">
        <div>
          <Button
            size="sm"
            variant="ghost"
            data-testid="github-paste-open"
            aria-expanded={pasting}
            aria-controls={pasteId}
            onClick={() => setPasting((open) => !open)}
          >
            <ChevronRight
              aria-hidden
              className={cn('transition-transform', pasting && 'rotate-90')}
            />
            {t.teamRepo.pasteOpen}
          </Button>
        </div>
        {pasting && (
          <div id={pasteId} className="flex flex-col gap-1 pl-3">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                setChanging(false)
                run(() => window.api.connectRemote(url))
              }}
            >
              <Input
                data-testid="github-url"
                placeholder={t.teamRepo.urlPlaceholder}
                aria-label={t.teamRepo.urlLabel}
                aria-describedby="github-url-hint"
                aria-invalid={hint !== null}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <Button
                type="submit"
                size="sm"
                className="h-9"
                data-testid="github-connect"
                disabled={hint !== null || url.trim() === '' || push.state === 'running'}
              >
                {t.teamRepo.connectAndUpload}
              </Button>
            </form>
            <p
              id="github-url-hint"
              data-testid="github-url-hint"
              className="text-caption text-muted-foreground"
            >
              {hint ?? t.teamRepo.urlHint}
            </p>
          </div>
        )}
      </div>
      {changing && (
        <div>
          <Button
            size="sm"
            variant="ghost"
            data-testid="github-change-cancel"
            onClick={() => setChanging(false)}
          >
            {t.teamRepo.cancelChange}
          </Button>
        </div>
      )}
      {status}
    </div>
  )
}

/**
 * 팀 저장소 — 앱에서 비공개 저장소를 만들어(또는 이미 만든 빈 저장소 주소로) 연결해 올린다. 연결된 뒤에는 "지금 올리기" 와 팀원 초대.
 * 올라가는 것은 승인해 병합된 것만이지만, 그 안에는 위키와 **넣어 둔 원본 자료가 함께** 있다 —
 * 그래서 이 화면은 무엇이 나가는지 먼저 말하고, 저장소가 공개면 올리기 전에 경고한다.
 * 올리기는 맨 위의 GitHub 로그인(`GithubLogin`) 하나를 쓴다 — 로그인하지 않았으면 main 이 로그인부터 하라고 돌려준다.
 */
export const TeamRepo = (): React.JSX.Element => {
  const t = useT()
  const { vault } = useSetup()
  if (vault !== 'ok') {
    return (
      <p
        data-testid="team-repo"
        data-state="no-vault"
        className="text-callout text-muted-foreground"
      >
        {t.teamRepo.noVault}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <GithubLogin />
      <RepoConnection />
    </div>
  )
}
