import { useId, useState } from 'react'
import { ChevronRight, Download, FolderOpen, FolderPlus, Users } from 'lucide-react'
import type { VaultStatus } from '../../../../shared/ipc-contract'
import { VAULT_TEMPLATES } from '../../../../shared/vault-templates'
import { githubUrlHint } from '../../../../shared/github-url'
import { cn } from '../../lib/utils'
import { formatElapsed } from '../../lib/elapsed'
import { toUserError, type UserError } from '../../lib/user-error'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ErrorNote } from '../error-note'
import { useSetup } from '../../hooks/use-setup'
import { useElapsed } from '../../hooks/use-elapsed'
import { AdoptOffer } from './vault-adopt'
import { GithubLogin } from './github-login'
import { TeamVaultList } from './team-vault-list'
import { getT, useT } from '../../lib/i18n'

const OPTIONS = [
  {
    id: 'none',
    get name(): string {
      return getT().vaultSetup.emptyName
    },
    get description(): string {
      return getT().vaultSetup.emptyDescription
    }
  },
  ...VAULT_TEMPLATES
]

/**
 * 새 볼트 만들기·기존 볼트 열기 — 시작 토픽 선택지는 이름과 설명을 함께 보인다(툴팁에 숨기지 않는다).
 * 폴더를 고르는 창에서 비어 있지 않은 폴더를 골라도 그 안에 2nd-brain 폴더를 만든다(main newVaultDir).
 * 첫 실행(starter)은 고르지 않는다 — 문서 폴더에 만들고, 로그인했으면 내 GitHub 에 템플릿으로 만들어 받는다.
 * 팀 보관함·기존 폴더 열기·위치 바꾸기는 그 이름을 단 접힌 칸에 둔다 — 첫 실행의 채움 단추는 만들기 하나다.
 */
export const VaultCreate = ({
  onResult,
  starter
}: {
  onResult: (status: VaultStatus) => void
  /** 첫 실행 시작하기 — github 이면 내 GitHub 에 만들어 받고, 아니면(나중에 하기) 이 컴퓨터에만 */
  starter?: { github: boolean }
}): React.JSX.Element => {
  const t = useT()
  const [template, setTemplate] = useState('none')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<UserError | null>(null)
  // 열기에서 고른 폴더가 보관함은 아니지만 노트가 있다 — 그대로 두고 보관함으로 쓰는 길
  const [adoptable, setAdoptable] = useState<VaultStatus['adoptable']>(undefined)
  // 팀 보관함에 들어가기 — 누르면 로그인·들어갈 수 있는 보관함 목록이 펼쳐진다. 주소 붙여 넣기는 그 안에 접어 둔다
  const [importing, setImporting] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [url, setUrl] = useState('')
  const urlHint = githubUrlHint(url)
  const pasteId = useId()
  const importId = useId()
  // 팀 보관함 받기는 큰 보관함이면 몇 분 걸린다 — 받는 동안 지난 시간을 보인다
  const [joining, setJoining] = useState(false)
  const elapsed = useElapsed(joining)
  // 만들기 진행 — 뼈대 복사+git 첫 커밋이라 몇 초 걸린다. 경과를 보여 죽은 듯 보이지 않게 한다.
  // 취소는 없다(한 번 부른 만들기는 끝까지 간다) — 엉뚱한 곳에 만들었으면 아래 안내대로 옮긴다
  const [creating, setCreating] = useState(false)
  const createElapsed = useElapsed(creating)
  const { github } = useSetup()
  const teamLoggedIn = github?.loggedIn === true
  const teamLoggedOut = github?.loggedIn === false
  const join = (action: () => Promise<VaultStatus>): void => {
    setJoining(true)
    run(() => action().finally(() => setJoining(false)))
  }

  const run = (action: () => Promise<VaultStatus>): void => {
    setBusy(true)
    setError(null)
    action()
      .then((status) => {
        // 보관함으로 쓰는 길이 있으면 실패가 아니다 — 아래 제안 칸이 말한다
        if (status.error && !status.adoptable) setError({ text: status.error, detail: null })
        setAdoptable(status.adoptable)
        onResult(status)
      })
      .catch((err: unknown) => setError(toUserError(err, getT().vaultSetup.openFailed)))
      .finally(() => setBusy(false))
  }

  const createStarter = (pickParent: boolean): void => {
    setCreating(true)
    run(() =>
      window.api
        .createStarterVault({ github: starter?.github === true, pickParent })
        .finally(() => setCreating(false))
    )
  }

  const otherWays = (
    <>
      {/* 팀원의 첫 실행은 여기서 시작한다 — 고르는 만들기에서는 같은 높이, 첫 실행에서는 이름을 단 접힌 칸 안이다 */}
      <Button
        size="sm"
        variant="outline"
        data-testid="vault-import-open"
        aria-expanded={importing}
        aria-controls={importId}
        disabled={busy}
        onClick={() => setImporting((open) => !open)}
      >
        <Users aria-hidden /> {t.vaultSetup.joinTeam}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        data-testid="vault-open"
        disabled={busy}
        onClick={() => run(() => window.api.openVault())}
      >
        <FolderOpen aria-hidden /> {t.vaultSetup.openExisting}
      </Button>
    </>
  )

  return (
    <div className="flex flex-col gap-3">
      {starter ? (
        <>
          <p className="text-callout text-label">
            {starter.github ? t.onboarding.starterGithubNote : t.onboarding.starterLocalNote}
          </p>
          {starter.github && (
            <p className="text-caption text-muted-foreground">{t.onboarding.githubPrivateNote}</p>
          )}
          <div>
            <Button
              size="sm"
              data-testid="vault-starter-create"
              disabled={busy}
              onClick={() => createStarter(false)}
            >
              <FolderPlus aria-hidden /> {error ? t.vaultSetup.recreate : t.vaultSetup.createMine}
            </Button>
          </div>
          {busy && (
            <p
              role="status"
              data-testid="vault-create-progress"
              className="text-caption text-muted-foreground"
            >
              {starter.github
                ? t.onboarding.starterProgressGithub
                : t.onboarding.starterProgressLocal}
              {creating && t.vaultSetup.elapsed(formatElapsed(createElapsed))}
            </p>
          )}
          <details data-testid="vault-starter-more">
            <summary className="focus-ring cursor-pointer rounded-sm text-caption text-muted-foreground">
              {t.vaultSetup.moreWays}
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                data-testid="vault-starter-pick"
                disabled={busy}
                onClick={() => createStarter(true)}
              >
                <FolderPlus aria-hidden /> {t.vaultSetup.createElsewhere}
              </Button>
              {otherWays}
            </div>
          </details>
        </>
      ) : (
        <>
          <fieldset>
            <legend className="text-caption text-muted-foreground">{t.vaultSetup.startWith}</legend>
            <p className="mt-1 text-caption text-muted-foreground">{t.vaultSetup.startWithNote}</p>
            <div
              className="mt-2 grid gap-1.5 sm:grid-cols-2"
              role="radiogroup"
              aria-label={t.vaultSetup.shapeLabel}
            >
              {OPTIONS.map((option) => {
                const selected = template === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`vault-template:${option.id}`}
                    onClick={() => setTemplate(option.id)}
                    className={cn(
                      'focus-ring tactile flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left',
                      selected ? 'border-foreground bg-accent' : 'border-hairline hover:bg-accent'
                    )}
                  >
                    <span className="text-callout font-medium">{option.name}</span>
                    <span className="text-caption text-muted-foreground">{option.description}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              data-testid="vault-create"
              disabled={busy}
              onClick={() => {
                setCreating(true)
                run(() =>
                  window.api
                    .createVault(template === 'none' ? undefined : template)
                    .finally(() => setCreating(false))
                )
              }}
            >
              <FolderPlus aria-hidden /> {t.vaultSetup.create}
            </Button>
            {otherWays}
          </div>
          {busy && (
            <p
              role="status"
              data-testid="vault-create-progress"
              className="text-caption text-muted-foreground"
            >
              {t.vaultSetup.creating}
              {creating && t.vaultSetup.elapsed(formatElapsed(createElapsed))}
            </p>
          )}
        </>
      )}
      {importing && (
        <div id={importId} className="flex flex-col gap-2" data-testid="vault-import">
          {/* 팀 보관함은 비공개 저장소다 — 받기 전에 그 저장소를 볼 수 있는 계정으로 로그인한다 */}
          <GithubLogin />
          <TeamVaultList
            busy={busy}
            onPick={(pick, invitationId) =>
              join(() => window.api.joinTeamVault(pick, invitationId))
            }
          />
          {joining && (
            <p
              role="status"
              data-testid="vault-import-progress"
              className="text-caption text-muted-foreground"
            >
              {t.vaultSetup.importing(formatElapsed(elapsed))}
            </p>
          )}
          <div>
            <Button
              size="sm"
              variant="ghost"
              data-testid="vault-import-url-open"
              aria-expanded={pasting}
              aria-controls={pasteId}
              onClick={() => setPasting((open) => !open)}
            >
              <ChevronRight
                aria-hidden
                className={cn('transition-transform', pasting && 'rotate-90')}
              />
              {t.vaultSetup.byAddress}
            </Button>
          </div>
          {pasting && (
            <div id={pasteId} className="flex flex-col gap-2 pl-3">
              <p className="text-caption text-muted-foreground">{t.vaultSetup.addressIntro}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="url"
                  data-testid="vault-import-url"
                  aria-label={t.vaultSetup.addressLabel}
                  placeholder={t.vaultSetup.addressPlaceholder}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="h-8 w-full sm:w-96"
                />
                <Button
                  size="sm"
                  data-testid="vault-import-start"
                  disabled={busy || url.trim() === '' || urlHint !== null || !teamLoggedIn}
                  title={teamLoggedOut ? t.vaultSetup.signInAbove : undefined}
                  onClick={() => join(() => window.api.importVault(url.trim()))}
                >
                  <Download aria-hidden /> {t.vaultSetup.receive}
                </Button>
              </div>
              {teamLoggedOut && (
                <p
                  data-testid="vault-import-login-note"
                  className="text-caption text-muted-foreground"
                >
                  {t.vaultSetup.signInToReceive}
                </p>
              )}
              {urlHint && (
                <p data-testid="vault-import-hint" className="text-caption text-muted-foreground">
                  {urlHint}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {adoptable && (
        <AdoptOffer
          offer={adoptable}
          onResult={(status) => {
            setAdoptable(status.adoptable)
            if (status.error) setError({ text: status.error, detail: null })
            onResult(status)
          }}
        />
      )}
      {!starter && <p className="text-caption text-muted-foreground">{t.vaultSetup.folderNote}</p>}
      {error && <ErrorNote error={error} testId="vault-error" />}
    </div>
  )
}
