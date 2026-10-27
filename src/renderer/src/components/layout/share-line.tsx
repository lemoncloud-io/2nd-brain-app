// 사이드바 상태 줄 아래 — 안 올린 내 수정을 팀 확인 요청으로 보내는 버튼 하나.
// 보낸 뒤에는 "팀 확인 중 · 열어 보기" 로 바뀌고, 그 뒤 새로 고친 것이 있으면 같은 요청에 더한다.
// 확인을 기다리는 위키화가 있으면 보이지 않는다 — 그때 수정은 그 승인과 함께 간다.
// 앱 밖에서 새로 만든 문서는 저절로 실리지 않는다 — 사람이 "함께 보내기" 를 고를 때만 싣는다(개인 메모가 섞이지 않게).
import { useState } from 'react'
import { ExternalLink, LoaderCircle, Send } from 'lucide-react'
import { useSetup } from '../../hooks/use-setup'
import { toUserError } from '../../lib/user-error'
import { getT } from '../../lib/i18n'
import { useT } from '../../lib/i18n'

export const ShareLine = (): React.JSX.Element | null => {
  const t = useT()
  const { sync } = useSetup()
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [withNew, setWithNew] = useState(false)

  const fresh = sync.newDocs
  const shared = sync.shared
  // 막힌 상태(팀 확인 중·승인 대기)에도 줄은 남아 사유를 말한다 — 사라지면 "어디로 갔나"가 된다
  const held = sync.held !== null || sync.skipped === 'review-pending'
  const include = withNew ? fresh : []
  const sending = [...sync.aheadFiles, ...include]
  const nothing = sending.length === 0
  if (nothing && fresh.length === 0 && !shared && !held) {
    return null
  }
  // 보낼 것이 없을 때는 버튼을 끄고 고르는 말을 남긴다 — 라벨과 잠금이 한 곳에서 나온다
  const canSend = !held && !running && !sync.running && sync.conflicts.length === 0 && !nothing

  const send = (): void => {
    setRunning(true)
    setError(null)
    window.api
      .shareEdits(include)
      .then((result) => {
        if (!result.ok) setError(result.reason)
        else setWithNew(false)
      })
      .catch((e: unknown) => setError(toUserError(e, getT().shell.shareFailed).text))
      .finally(() => setRunning(false))
  }

  const label = running
    ? t.shell.sharing
    : nothing
      ? t.shell.shareNothing
      : shared
        ? t.shell.shareMore
        : t.shell.shareEdits(Math.max(sending.length, 1))
  const showSend = !shared || shared.unsent > 0 || include.length > 0 || running

  return (
    <div className="flex flex-col gap-0.5 px-2" data-testid="sidebar-share-line">
      {shared && (
        <button
          type="button"
          data-testid="sidebar-share-open"
          title={t.shell.shareOpenHint}
          className="focus-ring flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-caption text-muted-foreground hover:bg-accent"
          onClick={() => void window.api.openExternal(shared.url)}
        >
          <ExternalLink aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{t.shell.shareOpen}</span>
        </button>
      )}
      {held ? (
        <p
          data-testid="sidebar-share-held"
          className="px-1.5 py-0.5 text-caption text-muted-foreground"
        >
          {sync.skipped === 'review-pending' ? t.shell.shareHeldReview : t.shell.shareHeldPending}
        </p>
      ) : (
        showSend && (
          <button
            type="button"
            data-testid="sidebar-share"
            // 무엇이 실려 가는지 누르기 전에 본다 — 앱 밖에서 고친 문서도 받기 때 자동 저장돼 여기 섞인다
            title={sending.length > 0 ? t.shell.shareFiles(sending.join('\n')) : undefined}
            disabled={!canSend}
            onClick={send}
            className="focus-ring tactile flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-caption text-foreground hover:bg-accent disabled:opacity-60"
          >
            {running ? (
              <LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin" />
            ) : (
              <Send aria-hidden className="size-3.5 shrink-0 text-primary" />
            )}
            <span className="truncate">{label}</span>
          </button>
        )
      )}
      {fresh.length > 0 && !held && (
        <label
          data-testid="sidebar-share-new"
          title={t.shell.shareFreshFiles(fresh.join('\n'))}
          className="flex items-center gap-1.5 px-1.5 py-0.5 text-caption text-muted-foreground"
        >
          <input
            type="checkbox"
            checked={withNew}
            disabled={running}
            onChange={(e) => setWithNew(e.target.checked)}
            className="size-3.5 shrink-0 accent-primary"
          />
          <span className="truncate">{t.shell.shareWithFresh(fresh.length)}</span>
        </label>
      )}
      {error && (
        <p
          role="alert"
          data-testid="sidebar-share-error"
          className="px-1.5 text-caption text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  )
}
