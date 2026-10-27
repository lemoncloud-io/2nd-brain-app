import { useCallback, useEffect, useState } from 'react'
import { RotateCw } from 'lucide-react'
import type { EngineUsage } from '../../../../shared/ipc-contract'
import type { AccountUsage } from '../../../../shared/account-usage'
import { shortModel } from '../../lib/model-label'
import { HIGH_USED, usageParts, type UsagePart } from '../../lib/usage-text'
import { useT } from '../../lib/i18n'

// 컴포저 아래 지표 줄 — 지금 도는 모델, AI 기억(대화가 찬 정도), 계정 사용량.
// 설정 `고급 표시` 를 켠 사람에게만 보인다(DESIGN.md § AI 한계 — 토큰·컨텍스트는 개발자의 어휘다).
// 값이 하나도 없으면 줄 자체를 그리지 않는다: codex 로 도는 대화에는 빈 자리가 남으면 안 된다.
// 읽는 차례가 곧 줄의 순서다: 무엇이 도나 → 이 대화가 얼마나 찼나 → 계정을 얼마나 썼나.
// 셋은 서로 다른 것이라 칸 사이를 띄우고, 한 칸 안은 붙인다. 숫자는 고정폭이라 답마다 흔들리지 않는다.

/**
 * 계정 여유는 대화와 무관하게 흐른다 — 켜져 있을 때만 묻고, 사용률이 바뀔 때(= 턴이 시작되거나
 * 끝날 때) 다시 본다.
 * `채워짐` 까지 남은 시간은 받아 온 그때를 기준으로 굳힌다: 그리는 동안 시계를 읽으면
 * 같은 값이 렌더마다 달라진다
 */
const useAccountParts = (
  ask: boolean,
  turnKey: unknown
): { parts: UsagePart[]; reread: () => void; rereading: boolean } => {
  const [parts, setParts] = useState<UsagePart[]>([])
  const [rereading, setRereading] = useState(false)
  // 사람이 다시 보기를 누른 횟수 — 바뀌면 effect 가 다시 돈다(턴이 안 바뀌어도)
  const [asked, setAsked] = useState(0)
  useEffect(() => {
    if (!ask) return
    let alive = true
    const take = (usage: AccountUsage | null): void => {
      if (!alive) return
      setParts(usageParts(usage, Date.now()))
      setRereading(false)
    }
    // 실패는 빈 값으로 온다 — 여유 칸만 조용히 빠진다
    window.api
      .getAccountUsage(asked > 0)
      .then(take)
      .catch(() => take(null))
    return () => {
      alive = false
    }
  }, [ask, turnKey, asked])
  const reread = useCallback((): void => {
    setRereading(true)
    setAsked((n) => n + 1)
  }, [])
  // 묻지 않는 동안에는 들고 있던 값도 쓰지 않는다 — 채팅 칸은 마운트를 유지하므로, 그러지 않으면
  // claude 대화에서 받은 여유가 codex 대화에 그대로 남는다
  return { parts: ask ? parts : [], reread, rereading }
}

/** 대화가 얼마나 찼나 — 숫자를 읽기 전에 눈으로 먼저 안다. 넘칠 때가 가까우면 색이 바뀐다 */
const Fill = ({ percent }: { percent: number }): React.JSX.Element => (
  <span aria-hidden className="bg-border block h-1 w-7 shrink-0 overflow-hidden rounded-full">
    <span
      className={`block h-full rounded-full ${percent > 75 ? 'bg-changed' : 'bg-muted-foreground/50'}`}
      // 1% 도 보이게 — 빈 막대는 "모른다" 로 읽힌다
      style={{ width: `${Math.min(100, Math.max(6, percent))}%` }}
    />
  </span>
)

export const ChatStatusBar = ({
  usage,
  show
}: {
  usage: EngineUsage | null
  show: boolean
}): React.JSX.Element | null => {
  const t = useT()
  // 계정 여유는 claude 계정의 것이다 — 모델을 알려 온 엔진에만 묻는다(codex 대화에는 남의 한도다)
  const {
    parts: account,
    reread,
    rereading
  } = useAccountParts(show && usage?.model != null, usage?.contextPercent ?? null)
  if (!show) return null
  const model = usage?.model ?? null
  const percent = usage?.contextPercent ?? null
  if (model === null && percent === null && account.length === 0) return null
  return (
    <p
      data-testid="chat-status-bar"
      // 좁은 칸(320px)에서는 줄이 접힌다 — 가로 스크롤을 만들지 않는다.
      // 줄 높이는 옆에 붙는 압축 단추(h-5)와 같다 — 첫 줄이 단추와 한 선에 놓인다
      className="text-micro text-muted-foreground flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 leading-5 tabular-nums"
    >
      {model !== null && (
        <span title={model} className="text-foreground/75 min-w-0 truncate font-medium">
          {shortModel(model)}
        </span>
      )}
      {percent !== null && (
        <span className="flex shrink-0 items-center gap-1.5">
          <Fill percent={percent} />
          <span title={t.chatView.memoryHint}>{t.chatView.memory(percent)}</span>
        </span>
      )}
      {account.length > 0 && (
        <span
          title={t.chatView.usageHint}
          className="flex min-w-0 flex-wrap items-center gap-x-1.5"
        >
          {account.map((part, index) => (
            <span key={part.label} className="min-w-0 shrink-0 truncate">
              {index > 0 && (
                <span aria-hidden className="text-muted-foreground/40 mr-1.5">
                  ·
                </span>
              )}
              {part.label}{' '}
              <span className={part.used >= HIGH_USED ? 'text-changed font-medium' : undefined}>
                {part.used}%
              </span>
              {part.when !== null && ` (${part.when})`}
            </span>
          ))}
          {/* 여유는 대화와 무관하게 흐른다 — 턴이 끝나기를 기다리지 않고 지금 다시 볼 수 있다 */}
          <button
            type="button"
            aria-label={t.chatView.usageReread}
            title={t.chatView.usageReread}
            data-testid="account-usage-reread"
            disabled={rereading}
            onClick={reread}
            className="hover:text-foreground focus-visible:ring-ring ml-0.5 shrink-0 rounded-sm p-0.5 transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          >
            <RotateCw className={`size-3 ${rereading ? 'animate-spin' : ''}`} aria-hidden />
          </button>
        </span>
      )}
    </p>
  )
}
