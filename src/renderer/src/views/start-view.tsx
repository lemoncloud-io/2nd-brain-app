import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Check, MessageCircle } from 'lucide-react'
import { BrandMark } from '../components/brand-mark'
import { EngineConnect } from '../components/start/engine-connect'
import { ENGINE_NAME } from '../lib/install-guide'
import { TeamRepo } from '../components/start/team-repo'
import { VaultCreate } from '../components/start/vault-create'
import { PurposeAsk } from '../components/start/purpose-ask'
import { GithubLogin } from '../components/start/github-login'
import { ErrorNote } from '../components/error-note'
import { FirstSample } from '../components/start/first-sample'
import { useSetup } from '../hooks/use-setup'
import { useViewVisible } from '../components/layout/view-id'
import { ViewBody, ViewHeader } from '../components/layout/view'
import { Button } from '../components/ui/button'
import { startProgress, type StartStepId } from '../lib/start-steps'
import { startDone } from '../lib/start-done'
import { repoLabel, starterSummary, stepPositionText } from '../lib/onboarding-text'
import type { VaultStatus } from '../../../shared/ipc-contract'
import { FIRST_STEPS, firstRunOf, type FirstStepId } from '../lib/first-run'
import { createTodayPrompt } from '../lib/chat-actions'
import { useTodayNotes } from '../hooks/use-today'
import { useChat } from './chat/chat-context'
import { cn } from '../lib/utils'
import { useWorkbench } from '../store/workbench'
import { useT } from '../lib/i18n'
import { LanguagePicker } from '../components/language-picker'
import { toUserError } from '../lib/user-error'

const basename = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

const StepMarker = ({
  index,
  state
}: {
  index: number
  state: 'done' | 'current' | 'later'
}): React.JSX.Element => (
  <span
    aria-hidden
    className={cn(
      'flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold tabular-nums',
      state === 'done' && 'bg-foreground text-background',
      state === 'current' && 'border-2 border-foreground text-foreground',
      state === 'later' && 'border border-hairline text-muted-foreground'
    )}
  >
    {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
  </span>
)

/**
 * 처음 3걸음 — 준비가 끝난 뒤 첫 승인까지 가는 길. 준비가 끝났을 때만 마운트된다:
 * 트리·채팅 구독이 숨은 시작하기에서 돌지 않게(보이면 StartView가 이미 visible 게이트를 탄다).
 * 진행은 저장하지 않고 파생만 한다 — 오늘 노트는 트리에서, 자료·위키화·승인은 journey(git)에서.
 */
/** 테스트에서 걸음 상태 전이를 직접 마운트한다 — e2e는 첫 상태와 채우기만 본다. */
export const FirstSteps = (): React.JSX.Element => {
  const { journey } = useSetup()
  const tree = useWorkbench((s) => s.tree)
  const { today } = useTodayNotes()
  const setView = useWorkbench((s) => s.setView)
  const openKnowledge = useWorkbench((s) => s.openKnowledge)
  const requestIngest = useWorkbench((s) => s.requestIngest)
  const openToday = useWorkbench((s) => s.openToday)
  const askChat = useWorkbench((s) => s.askChat)
  const chat = useChat()

  const todayRel = today?.rel ?? null
  const waiting = journey?.clippings ?? 0
  const first = firstRunOf(tree, todayRel, journey ?? null)
  // 채팅이 노트를 쓴다 — 보내지 않고 입력칸에 채우고 초점까지만(구독 과금은 사용자가 Enter로 낸다)
  const prefillToday = (): void => {
    chat.setDraft(createTodayPrompt())
    askChat()
  }

  const t = useT()
  const firstSteps: Record<
    FirstStepId,
    { title: string; later: string; summary: string; body: React.ReactNode }
  > = {
    today: {
      title: t.start.first.today.title,
      later: t.start.first.today.later,
      summary: t.start.first.today.summary,
      body:
        todayRel !== null ? (
          <div className="flex flex-col gap-1.5">
            {/* 끝난 걸음의 단추는 테두리 — 채움은 지금 걸음 하나만 든다(#9) */}
            <Button
              size="sm"
              variant="outline"
              data-testid="first-today-open"
              onClick={() => openToday(todayRel)}
            >
              <BookOpen aria-hidden /> {t.start.openToday}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Button size="sm" data-testid="first-today-chat" onClick={prefillToday}>
              <MessageCircle aria-hidden /> {t.start.first.today.fromChat}
            </Button>
            <p className="text-caption text-muted-foreground">{t.start.first.today.fromChatHint}</p>
          </div>
        )
    },
    clip: {
      title: t.start.first.clip.title,
      later: t.start.first.clip.later,
      summary: t.start.first.clip.summary,
      body:
        waiting > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-callout text-label">{t.start.first.clip.waiting(waiting)}</p>
            <Button size="sm" data-testid="first-ingest" onClick={requestIngest}>
              {t.start.first.clip.ingest} <ArrowRight aria-hidden />
            </Button>
            <p className="text-caption text-muted-foreground">{t.start.first.clip.ingestHint}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Button size="sm" data-testid="first-sources" onClick={() => openKnowledge('sources')}>
              {t.start.first.clip.add} <ArrowRight aria-hidden />
            </Button>
            <FirstSample />
            <p className="text-caption text-muted-foreground">{t.start.first.clip.addHint}</p>
          </div>
        )
    },
    approve: {
      title: t.start.first.approve.title,
      later: t.start.first.approve.later,
      summary: t.start.first.approve.summary,
      body: (
        <div className="flex flex-col gap-1.5">
          <Button size="sm" data-testid="first-review" onClick={() => openKnowledge('review')}>
            {t.start.first.approve.open} <ArrowRight aria-hidden />
          </Button>
        </div>
      )
    }
  }

  return (
    <section
      data-testid="start-first-steps"
      aria-label={t.start.first.label}
      className="flex flex-col gap-3 border-t border-hairline pt-6"
    >
      <div>
        <h2 className="text-callout font-semibold">
          {t.start.first.heading}{' '}
          <span className="font-normal text-muted-foreground">{t.start.first.headingHint}</span>
        </h2>
        <p className="mt-1 text-caption text-muted-foreground">{t.start.first.intro}</p>
      </div>
      {first.complete ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-callout text-label">{t.start.first.complete}</p>
          <Button size="sm" variant="outline" onClick={() => setView('doc')}>
            <BookOpen aria-hidden /> {t.start.first.toToday}
          </Button>
        </div>
      ) : (
        <ol data-testid="start-first-list" className="flex flex-col">
          {FIRST_STEPS.map((id, index) => {
            const step = firstSteps[id]
            const state = first.done[id] ? 'done' : first.current === id ? 'current' : 'later'
            const last = index === FIRST_STEPS.length - 1
            return (
              <li
                key={id}
                data-testid={`start-first-${id}`}
                data-state={first.checking ? 'checking' : state}
                aria-current={state === 'current' ? 'step' : undefined}
                className="flex gap-4"
              >
                <div className="flex flex-col items-center">
                  <StepMarker index={index} state={state} />
                  {!last && <span aria-hidden className="my-1 w-px flex-1 bg-hairline" />}
                </div>
                <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-6')}>
                  <div className="flex min-h-6 flex-wrap items-baseline gap-x-3">
                    <h3
                      className={cn(
                        'text-callout font-semibold',
                        state === 'later' ? 'text-muted-foreground' : 'text-foreground'
                      )}
                    >
                      {step.title}
                    </h3>
                    <p className="min-w-0 truncate text-caption text-muted-foreground">
                      {state === 'done' ? step.summary : state === 'later' ? step.later : ''}
                    </p>
                  </div>
                  {state === 'current' && <div className="mt-3">{step.body}</div>}
                  {first.checking && id === 'today' && todayRel === null && (
                    <div className="mt-3">{step.body}</div>
                  )}
                  {id === 'today' && state === 'done' && <div className="mt-3">{step.body}</div>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {first.checking && (
        <p className="text-caption text-muted-foreground" role="status">
          {t.start.first.checking}
        </p>
      )}
    </section>
  )
}

/**
 * 시작하기 — 하루를 시작하는 데 필요한 두 가지(엔진 연결·보관함)를 한 화면에서 순서대로.
 * 지금 할 단계 하나만 펼치고, 끝난 단계는 한 줄 요약이다. 저장하지 않는다 — 준비 상태에서 계산한다.
 * 자료 넣기·위키화·승인은 준비가 아니라 매일 도는 일이라 지식 관리 안에 있다.
 */
export const StartView = (): React.JSX.Element => {
  const t = useT()
  const setup = useSetup()
  const { engine, vault, engineKind, engineStatus, github, remote, remoteKnown, refresh } = setup
  const setView = useWorkbench((s) => s.setView)
  const startFrom = useWorkbench((s) => s.startFrom)
  const setStartFrom = useWorkbench((s) => s.setStartFrom)
  const [vaultDir, setVaultDir] = useState<string | null>(null)
  // 첫 실행인지는 마운트할 때 한 번 정한다 — 준비가 끝나 기록이 생겨도 보던 단계가 사라지지 않게
  const [firstRun] = useState(() => !startDone())
  // 첫 질문의 답 — undefined 는 아직 모름, null 은 답 없음. 건너뛰기·나중에 하기는 이번 실행에만 기억한다
  const [purposeAnswer, setPurposeAnswer] = useState<string | null | undefined>(undefined)
  const [purposeSkipped, setPurposeSkipped] = useState(false)
  const [deferredGithub, setDeferredGithub] = useState(false)
  const [starter, setStarter] = useState<VaultStatus['starter']>(undefined)
  // 언어는 화면에서 이미 바뀌었다 — 기억에 못 남긴 것만 알린다(문장은 그릴 때 만들어 바꾼 언어로 보인다)
  const [languageError, setLanguageError] = useState<unknown>(null)
  const loggedIn = github?.loggedIn ?? null
  // 못 올린 알림은 아직 원격이 없을 때만 — 아래 GitHub에 올리기에서 다시 올리면 낡은 실패가 남지 않게
  const publishFailed = starter?.publishError !== undefined && remoteKnown && remote === null
  const progress = startProgress({
    purpose: purposeSkipped ? true : purposeAnswer === undefined ? null : purposeAnswer !== null,
    engine,
    github: loggedIn,
    vault,
    // 이번에 GitHub 을 나중에 하기로 했으면 올리기를 바로 다시 내밀지 않는다 — 걸음은 남고 펼치지 않는다
    remote: !remoteKnown ? null : remote !== null ? true : deferredGithub ? null : false,
    deferredGithub,
    startDone: !firstRun
  })
  // 이번에 펼친 올리기 칸은 올린 뒤에도 접지 않는다 — 연결 성공 줄과 팀원 초대를 같은 칸에서 이어 본다.
  // 보관함마다 따로 — 다른 보관함으로 바꾸면 그 보관함의 상태로 다시 정한다
  const [publishOpenFor, setPublishOpenFor] = useState<string | null>(null)
  if (progress.current === 'publish' && vaultDir !== null && publishOpenFor !== vaultDir)
    setPublishOpenFor(vaultDir)
  const publishOpen = vaultDir !== null && publishOpenFor === vaultDir
  const name = ENGINE_NAME[engineKind]
  // 완료 배너의 단추는 처음 3걸음이 다 끝났을 때만 채운다 — 걸음이 남았으면
  // 채움은 지금 걸음의 단추 하나다(FirstSteps). 계산은 FirstSteps 와 같은 식이다
  const tree = useWorkbench((s) => s.tree)
  const { today } = useTodayNotes()
  const firstComplete = firstRunOf(tree, today?.rel ?? null, setup.journey).complete
  // 설정과 같은 연결·볼트 조작을 담는다 — 숨어 있을 때 그리면 같은 버튼이 두 벌 생기고 폴링도 겹친다
  const visible = useViewVisible()

  useEffect(() => {
    window.api
      .getVaultStatus()
      .then((status) => setVaultDir(status.vaultDir))
      .catch(console.error)
  }, [vault])

  useEffect(() => {
    if (!firstRun) return
    window.api
      .getOnboardingPurpose()
      .then(setPurposeAnswer)
      .catch((e: unknown) => {
        // 못 읽으면 다시 묻는다 — 시작하기가 "확인 중" 에 서 있는 것보다 낫다
        console.error('could not read the onboarding purpose', e)
        setPurposeAnswer(null)
      })
  }, [firstRun])

  const steps: Record<
    StartStepId,
    { title: string; later: string; summary: string; body: React.ReactNode }
  > = {
    purpose: {
      title: t.start.purpose.title,
      later: '',
      summary: purposeAnswer
        ? purposeAnswer
        : vault === 'ok'
          ? t.start.purpose.laterVault
          : t.start.purpose.skipped,
      body: (
        <PurposeAsk
          onDone={(answer) => {
            setPurposeAnswer(answer)
            if (answer === null) setPurposeSkipped(true)
          }}
        />
      )
    },
    engine: {
      title: t.start.engine.title(name),
      later: t.start.engine.later,
      summary: engineStatus?.auth.email
        ? `${name} · ${engineStatus.auth.email}`
        : t.start.engine.connected(name),
      body: <EngineConnect />
    },
    github: {
      title: t.start.github.title,
      later: t.start.github.later,
      summary:
        loggedIn === true
          ? github?.login
            ? `GitHub · ${github.login}`
            : t.start.github.connected
          : deferredGithub
            ? t.start.github.deferred
            : t.start.github.notYet,
      body: <GithubLogin onLater={() => setDeferredGithub(true)} />
    },
    vault: {
      title: t.start.vault.title,
      later: t.start.vault.later,
      summary: starter
        ? starterSummary(publishFailed ? starter : { ...starter, publishError: undefined })
        : vaultDir
          ? basename(vaultDir)
          : t.start.vault.ready,
      body: (
        <VaultCreate
          starter={firstRun ? { github: loggedIn === true } : undefined}
          onResult={(status) => {
            if (status.starter) setStarter(status.starter)
            refresh()
          }}
        />
      )
    },
    publish: {
      title: t.start.publish.title,
      later: t.start.publish.later,
      summary: remote ? `GitHub · ${repoLabel(remote.webUrl)}` : '',
      body: <TeamRepo />
    }
  }
  const description = progress.complete
    ? progress.current === 'publish'
      ? t.start.descDoneLater(t.onboarding.publishLater)
      : t.start.descDone
    : !firstRun
      ? t.start.descReturning(t.onboarding.publishLater)
      : progress.position !== null
        ? stepPositionText(progress.position, progress.steps.length)
        : t.start.descSteps(progress.steps.length)

  if (!visible) return <></>

  return (
    <>
      <ViewHeader title={t.start.title} description={description}>
        {/* 설정에서 다시 보기로 왔을 때만 — 처음 온 시작하기에는 돌아갈 설정이 없다 */}
        {startFrom === 'settings' && (
          <Button
            variant="outline"
            size="sm"
            data-testid="back-to-settings"
            onClick={() => {
              setStartFrom(null)
              setView('settings')
            }}
          >
            {t.start.backToSettings}
          </Button>
        )}
      </ViewHeader>
      <ViewBody width="reading">
        <div data-testid="start-brand" className="flex items-center gap-3">
          <BrandMark size={40} />
          <p className="text-title">2nd-brain</p>
          <LanguagePicker
            testIdPrefix="start-language"
            onSaved={() => setLanguageError(null)}
            onSaveFailed={(cause) => setLanguageError(cause)}
            className="ml-auto"
          />
        </div>
        {languageError !== null && (
          <ErrorNote
            error={toUserError(languageError, t.common.saveSettingFailed)}
            testId="start-language-error"
          />
        )}
        <p className="text-caption text-muted-foreground">{t.start.intro}</p>

        {progress.complete && (
          <section data-testid="start-complete" className="flex flex-col items-start gap-3">
            <h2 className="text-heading">{t.start.doneTitle}</h2>
            <p className="text-callout text-label">{t.start.doneBody}</p>
            <Button
              size="sm"
              variant={firstComplete ? 'default' : 'outline'}
              onClick={() => setView('doc')}
            >
              <BookOpen aria-hidden /> {t.start.openToday}
            </Button>
          </section>
        )}

        {progress.complete && <FirstSteps />}

        <ol data-testid="start-steps" aria-label={t.start.stepsLabel} className="flex flex-col">
          {progress.steps.map((id, index) => {
            const step = steps[id]
            const state = progress.done[id] ? 'done' : progress.current === id ? 'current' : 'later'
            const last = index === progress.steps.length - 1
            return (
              <li
                key={id}
                data-testid={`start-step-${id}`}
                data-state={progress.checking ? 'checking' : state}
                aria-current={state === 'current' ? 'step' : undefined}
                className="flex gap-4"
              >
                <div className="flex flex-col items-center">
                  <StepMarker index={index} state={state} />
                  {!last && <span aria-hidden className="my-1 w-px flex-1 bg-hairline" />}
                </div>
                <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-6')}>
                  <div className="flex min-h-6 flex-wrap items-baseline gap-x-3">
                    <h2
                      className={cn(
                        'text-callout font-semibold',
                        state === 'later' ? 'text-muted-foreground' : 'text-foreground'
                      )}
                    >
                      {step.title}
                    </h2>
                    {/* 요약에는 사람이 적은 답·저장소 이름처럼 긴 값이 온다 — 잘려도 전체를 툴팁으로 읽는다 */}
                    <p
                      className="min-w-0 truncate text-caption text-muted-foreground"
                      title={state === 'done' ? step.summary : undefined}
                    >
                      {state === 'done' ? step.summary : state === 'later' ? step.later : ''}
                    </p>
                  </div>
                  {(state === 'current' || (id === 'publish' && publishOpen)) && (
                    <div className="mt-3">{step.body}</div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>

        {publishFailed && starter?.publishError !== undefined && (
          <ErrorNote
            error={{ text: t.onboarding.starterPublishFailed, detail: starter.publishError }}
            testId="starter-publish-error"
          />
        )}

        {progress.checking && (
          <p className="text-caption text-muted-foreground" role="status">
            {t.start.checking}
          </p>
        )}

        {progress.done.publish && !publishOpen && (
          // 올린 뒤의 팀 저장소 관리(팀원 초대·연결 끊기) — 올리기 전에는 위 걸음이 같은 칸을 펼쳐 둔다
          <details className="border-t border-hairline pt-6">
            <summary
              data-testid="start-team-toggle"
              className="focus-ring cursor-pointer rounded-sm text-callout font-semibold"
            >
              {t.start.teamRepo}{' '}
              <span className="font-normal text-muted-foreground">{t.start.teamRepoHint}</span>
            </summary>
            <div className="mt-3">
              <TeamRepo />
            </div>
          </details>
        )}
      </ViewBody>
    </>
  )
}
