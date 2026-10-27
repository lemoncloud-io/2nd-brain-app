// 같은 문서를 둘이 고쳤을 때 — "팀 것" 과 "내 것" 을 나란히 놓고 하나를 고른다.
// git 어휘는 쓰지 않는다. 고르지 않은 쪽은 버리지 않고 옆에 남는다고 화면이 먼저 말한다.
import { useEffect, useRef, useState } from 'react'
import { Users, User } from 'lucide-react'
import type { ConflictSides } from '../../../shared/ipc-contract'
import { Button } from '../components/ui/button'
import { ErrorNote } from '../components/error-note'
import { toUserError, type UserError } from '../lib/user-error'
import { useSetup } from '../hooks/use-setup'
import { getT, useT } from '../lib/i18n'

const Side = ({
  title,
  icon,
  text,
  testId,
  onPick,
  busy
}: {
  title: string
  icon: React.ReactNode
  text: string | null
  testId: string
  onPick: () => void
  busy: boolean
}): React.JSX.Element => {
  const t = useT()
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-hairline p-3">
      <div className="flex items-center gap-2">
        {icon}
        <h4 id={`${testId}-title`} className="text-callout font-semibold">
          {title}
        </h4>
      </div>
      {text === null ? (
        <p data-testid={`${testId}-text`} className="text-caption text-muted-foreground">
          {t.sync.conflict.deleted}
        </p>
      ) : (
        <pre
          data-testid={`${testId}-text`}
          tabIndex={0}
          className="scrollbar-thin max-h-56 overflow-auto rounded-md bg-accent/40 p-2 text-caption whitespace-pre-wrap"
        >
          {text}
        </pre>
      )}
      <div>
        <Button
          size="sm"
          id={testId}
          data-testid={testId}
          disabled={busy}
          onClick={onPick}
          aria-labelledby={`${testId}-title ${testId}`}
        >
          {t.sync.conflict.keep}
        </Button>
      </div>
    </div>
  )
}

export const ConflictPicker = (): React.JSX.Element => {
  const t = useT()
  const { sync } = useSetup()
  const path = sync.conflicts[0] ?? null
  const [sides, setSides] = useState<ConflictSides | null>(null)
  // 오류는 난 자리를 기억한다 — 다른 문서로 넘어가면 남의 오류를 내놓지 않는다
  const [failure, setFailure] = useState<{ error: UserError; path: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // 연타하면 같은 문서 저장이 경쟁한다 — 단추 disabled 는 다시 그린 뒤라 한 프레임이 빈다
  const busyRef = useRef(false)

  useEffect(() => {
    if (path === null) return
    // 늦게 온 이전 문서 답이 지금 문서를 지우면 영원히 읽는 중으로 보인다
    let alive = true
    window.api
      .readConflict(path)
      .then((result) => {
        if (!alive) return
        if ('error' in result) {
          setSides(null)
          setFailure({ error: { text: result.error, detail: null }, path })
          return
        }
        setSides(result)
        setFailure(null)
      })
      .catch((e: unknown) => {
        if (alive) setFailure({ error: toUserError(e, getT().sync.conflict.readFailed), path })
      })
    return () => {
      alive = false
    }
  }, [path])

  if (path === null) return <></>
  // 읽어 둔 내용이 다른 문서 것이면 아직 이 문서 것을 못 읽은 것이다
  const shown = sides?.path === path ? sides : null

  const pick = (choice: 'team' | 'mine'): void => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    window.api
      .resolveConflict(path, choice)
      .then((result) => {
        // 남은 목록은 main 이 곧바로 보내 준다 — 여기서 다시 받지 않는다(오프라인이면 성공 뒤에 오류가 뜬다)
        if (!result.ok) setFailure({ error: { text: result.reason, detail: null }, path })
      })
      .catch((e: unknown) =>
        setFailure({ error: toUserError(e, getT().sync.conflict.saveFailed), path })
      )
      .finally(() => {
        busyRef.current = false
        setBusy(false)
      })
  }

  return (
    <section
      data-testid="conflict-picker"
      aria-labelledby="conflict-title"
      className="flex flex-col gap-3 rounded-lg border border-hairline bg-elevated p-4 shadow-raised"
    >
      <div>
        <h3 id="conflict-title" className="text-title">
          {t.sync.conflict.title}
        </h3>
        <p className="mt-1 text-callout text-label">
          <span data-testid="conflict-path">{path}</span> {t.sync.conflict.explain}
          {sync.conflicts.length > 1 && t.sync.conflict.more(sync.conflicts.length)}
        </p>
      </div>
      {shown && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Side
            title={t.sync.conflict.team}
            icon={<Users aria-hidden className="size-4 text-muted-foreground" />}
            text={shown.team}
            testId="conflict-pick-team"
            busy={busy}
            onPick={() => pick('team')}
          />
          <Side
            title={t.sync.conflict.mine}
            icon={<User aria-hidden className="size-4 text-muted-foreground" />}
            text={shown.mine}
            testId="conflict-pick-mine"
            busy={busy}
            onPick={() => pick('mine')}
          />
        </div>
      )}
      {failure !== null && failure.path === path && (
        <ErrorNote error={failure.error} testId="conflict-error" />
      )}
    </section>
  )
}
