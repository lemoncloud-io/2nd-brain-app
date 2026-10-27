import { cn } from '@renderer/lib/utils'

/** `id` 는 다른 화면이 이 묶음으로 바로 데려올 때 쓴다(`lib/reveal-settings.ts`) */
type SettingsSectionProps = { title: string; children: React.ReactNode; id?: string }

// 설정 한 묶음 — 카드 대신 hairline 으로 나눈다(DESIGN.md § Spacing, radius, elevation).
export const SettingsSection = ({
  title,
  children,
  id
}: SettingsSectionProps): React.JSX.Element => (
  <section
    id={id}
    aria-labelledby={id && `${id}-title`}
    className="scroll-mt-6 border-b border-hairline py-6 first:pt-0 last:border-b-0"
  >
    <h2
      id={id && `${id}-title`}
      tabIndex={id ? -1 : undefined}
      className={id ? 'focus-ring rounded-sm text-heading' : 'text-heading'}
    >
      {title}
    </h2>
    <div className="mt-3">{children}</div>
  </section>
)

const DOT_TONE = {
  ok: 'bg-primary',
  warn: 'bg-warning',
  idle: 'bg-muted-foreground'
} as const

export const StatusDot = ({
  tone,
  className
}: {
  tone: keyof typeof DOT_TONE
  className?: string
}): React.JSX.Element => (
  <span
    aria-hidden
    className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT_TONE[tone], className)}
  />
)
