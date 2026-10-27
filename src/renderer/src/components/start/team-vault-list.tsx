// 들어갈 수 있는 팀 보관함 — 로그인한 GitHub 계정이 볼 수 있는 보관함과 받은 초대. 팀원은 주소를 몰라도 골라 받는다.
// 보관함인지는 main 이 `VAULT_RULES.md` 로 가른다(`github/repos.ts`). 초대는 수락해야 저장소가 보여 보관함인지 미리 알 수 없다.
import { useEffect, useId, useState } from 'react'
import { Download, MailOpen } from 'lucide-react'
import type { TeamVaults } from '../../../../shared/ipc-contract'
import { useSetup } from '../../hooks/use-setup'
import { toUserError } from '../../lib/user-error'
import { Button } from '../ui/button'
import { ErrorNote } from '../error-note'
import { getT, useT } from '../../lib/i18n'

export const TeamVaultList = ({
  busy,
  onPick
}: {
  busy: boolean
  /** 고른 보관함 받기 — 받은 초대면 그 번호를 같이 넘긴다(main 이 받을 곳을 고른 뒤 수락한다) */
  onPick: (url: string, invitationId?: number) => void
}): React.JSX.Element | null => {
  const t = useT()
  const { github } = useSetup()
  const loggedIn = github?.loggedIn === true
  const loggedOut = github?.loggedIn === false
  const [list, setList] = useState<TeamVaults | null>(null)
  // 다시 읽기 — 대표가 방금 초대했을 때 사람이 누른다
  const [tries, setTries] = useState(0)
  const titleId = useId()

  // 로그인한 계정이 바뀌면 다시 읽는다 — 답이 오기 전에 바뀌면 옛 답은 버린다
  useEffect(() => {
    if (!loggedIn) return
    let live = true
    window.api
      .githubTeamVaults()
      .then((result) => {
        if (live) setList(result)
      })
      .catch((error: unknown) => {
        if (live) {
          setList({
            ok: false,
            reason: toUserError(error, getT().vaultSetup.teamListFailed).text
          })
        }
      })
    // 다음 읽기 동안은 "찾는 중" — 옛 목록을 누르면 바뀐 계정으로 옛 보관함을 받는다
    return () => {
      live = false
      setList(null)
    }
  }, [loggedIn, github?.login, tries])

  const empty = list?.ok === true && list.vaults.length === 0 && list.invitations.length === 0

  return (
    <section data-testid="team-vaults" aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id={titleId} className="text-callout font-semibold">
          {t.vaultSetup.teamListTitle}
        </h3>
        {loggedIn && (
          <Button
            size="sm"
            variant="ghost"
            data-testid="team-vaults-reload"
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            // disabled 로 막으면 누른 단추가 초점을 잃는다 — 읽는 중에는 눌러도 아무 일도 하지 않는다
            aria-disabled={list === null}
            title={list === null ? t.vaultSetup.teamListBusy : undefined}
            onClick={() => {
              if (list !== null) setTries((n) => n + 1)
            }}
          >
            {t.vaultSetup.reload}
          </Button>
        )}
      </div>
      {!loggedIn ? (
        <p
          data-testid={loggedOut ? 'team-vaults-soon' : undefined}
          role="status"
          className="text-caption text-muted-foreground"
        >
          {loggedOut ? t.vaultSetup.teamListSignIn : t.vaultSetup.githubChecking}
        </p>
      ) : list === null ? (
        <p role="status" className="text-caption text-muted-foreground">
          {t.vaultSetup.searching}
        </p>
      ) : !list.ok ? (
        <ErrorNote
          error={{ text: list.reason, detail: list.detail ?? null }}
          testId="team-vaults-error"
        />
      ) : empty ? (
        <p data-testid="team-vaults-empty" className="text-caption text-muted-foreground">
          {t.vaultSetup.teamListEmpty}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
          {list.invitations.map((invite) => (
            <li
              key={`invite:${invite.id}`}
              data-testid={`team-invitation:${invite.fullName}`}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-callout">{invite.fullName}</p>
                <p className="text-caption text-muted-foreground">
                  {t.vaultSetup.invitedBy(invite.inviter ?? null)}
                </p>
              </div>
              <Button
                size="sm"
                disabled={busy}
                aria-label={t.vaultSetup.acceptLabel(invite.fullName)}
                onClick={() => onPick(invite.url, invite.id)}
              >
                <MailOpen aria-hidden /> {t.vaultSetup.accept}
              </Button>
            </li>
          ))}
          {list.vaults.map((vault) => (
            <li
              key={vault.fullName}
              data-testid={`team-vault:${vault.fullName}`}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <p className="min-w-0 truncate text-callout">{vault.fullName}</p>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                aria-label={t.vaultSetup.receiveLabel(vault.fullName)}
                onClick={() => onPick(vault.url)}
              >
                <Download aria-hidden /> {t.vaultSetup.receive}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
