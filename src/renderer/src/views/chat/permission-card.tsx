// 승인 카드 — 엔진이 도구를 쓰기 전에 사람에게 묻는다. 스트리밍 답 아래에 둔다.
// 원문(도구 이름·명령·경로)은 자르더라도 전체를 볼 길을 둔다(CLAUDE.md § 화면 문구).
import { useState } from 'react'
import type { ChatPermissionAnswer } from '../../../../shared/chat-permission'
import { sessionAllowLabel, toolActivity } from '../../lib/tool-text'
import { useT } from '../../lib/i18n'

const RAW_FOLD_AT = 80

export const PermissionCard = ({
  tool,
  target,
  onAnswer
}: {
  tool: string
  target: string
  onAnswer: (answer: ChatPermissionAnswer) => void
}): React.JSX.Element => {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const raw = `${tool}${target ? ` ${target}` : ''}`.trim()
  const folded = raw.length > RAW_FOLD_AT && !expanded
  return (
    <div
      data-testid="chat-permission-card"
      className="rounded-lg border border-hairline bg-accent px-3 py-2"
    >
      <p className="text-callout text-label">{t.tools.permissionTitle}</p>
      <p className="mt-0.5 text-callout text-muted-foreground">{toolActivity(tool, target)}</p>
      <p
        data-testid="chat-permission-raw"
        title={raw}
        className="mt-1 text-caption break-all text-muted-foreground"
      >
        {folded ? `${raw.slice(0, RAW_FOLD_AT)}…` : raw}
      </p>
      {raw.length > RAW_FOLD_AT && (
        <button
          type="button"
          data-testid="chat-permission-more"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="focus-ring mt-0.5 rounded text-caption text-muted-foreground hover:text-foreground"
        >
          {expanded ? t.chatView.permission.fold : t.chatView.permission.more}
        </button>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="chat-permission-allow"
          onClick={() => onAnswer('allow')}
          className="focus-ring rounded-md bg-primary px-2.5 py-1 text-callout text-primary-foreground"
        >
          {t.chatView.permission.allow}
        </button>
        <button
          type="button"
          data-testid="chat-permission-session"
          onClick={() => onAnswer('session')}
          className="focus-ring rounded-md border border-hairline px-2.5 py-1 text-callout"
        >
          {sessionAllowLabel(tool)}
        </button>
        <button
          type="button"
          data-testid="chat-permission-deny"
          onClick={() => onAnswer('deny')}
          className="focus-ring rounded-md border border-hairline px-2.5 py-1 text-callout text-muted-foreground"
        >
          {t.chatView.permission.deny}
        </button>
      </div>
    </div>
  )
}
