// 검토 목차 — 리더 오른쪽에 붙어 있는 절 목록. 절마다 체크박스 n/m 을 달고, 지금 읽는 절을 밝히고,
// 기준 시점 이후 바뀐 절에 점을 찍는다. 문서를 훑지 않고도 "무엇이 남았나" 가 한눈에 보여야 한다.
//
// 절 이름표(id)는 리더가 헤딩에 붙인 것과 같다 — 두 벌로 지으면 눌러도 그 절로 가지 않는다(plan-outline).
import { useEffect, useMemo, useState } from 'react'
import { ListTree } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'
import { isChanged, type Marks } from '../../lib/doc-marks'
import { outlineOf, type OutlineSection } from '../../lib/plan-outline'
import { useT } from '../../lib/i18n'

export type OutlineProps = {
  /** 리더가 그리는 본문 — 헤딩 줄 번호가 이 글 기준이다 */
  text: string
  /** 기준 시점 이후 바뀐 곳 — 바뀐 절에 점을 찍는다 */
  marks?: Marks
  openOnly: boolean
  onOpenOnly: (on: boolean) => void
  /** 리더의 스크롤 칸 — 지금 읽는 절을 여기서 잰다 */
  scrollRef: React.RefObject<HTMLDivElement | null>
}

type Row = OutlineSection & { changed: boolean }

type Outline = { rows: Row[]; total: number }

const outlineFor = (text: string, marks: Marks | undefined): Outline => {
  const { sections, total } = outlineOf(text)
  const end = text.split('\n').length
  return {
    total,
    rows: sections.map((section, index) => ({
      ...section,
      changed:
        marks !== undefined &&
        isChanged(marks, section.line, (sections[index + 1]?.line ?? end + 1) - 1)
    }))
  }
}

/**
 * 그 이름표를 단 헤딩 — 리더 칸 안에서만 찾는다. `document.getElementById` 로 찾으면 같은 이름표를
 * 단 채팅 칸의 근거 시트 헤딩이 먼저 걸려 엉뚱한 칸을 재고 스크롤한다.
 */
const headingIn = (root: HTMLElement | null, id: string): HTMLElement | null =>
  [...(root?.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6') ?? [])].find(
    (node) => node.id === id
  ) ?? null

/** 지금 읽는 절 — 스크롤 칸 위끝을 지난 마지막 헤딩이다 */
const useActiveSection = (scrollRef: OutlineProps['scrollRef'], ids: string[]): string | null => {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el === null || ids.length === 0) return
    const pick = (): void => {
      const top = el.getBoundingClientRect().top
      let current: string | null = null
      for (const id of ids) {
        const node = headingIn(el, id)
        if (!node) continue
        // 위끝을 조금 지난 헤딩까지가 "읽는 중" 이다 — 딱 0 이면 헤딩이 걸칠 때마다 깜빡인다
        if (node.getBoundingClientRect().top - top > 8) break
        current = id
      }
      setActive(current ?? ids[0] ?? null)
    }
    pick()
    el.addEventListener('scroll', pick, { passive: true })
    return () => el.removeEventListener('scroll', pick)
  }, [scrollRef, ids])
  return active
}

const jumpTo = (root: HTMLElement | null, id: string): void => {
  headingIn(root, id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}

const OpenOnlyToggle = ({
  openOnly,
  onOpenOnly
}: Pick<OutlineProps, 'openOnly' | 'onOpenOnly'>): React.JSX.Element => {
  const t = useT()
  return (
    <button
      type="button"
      data-testid="outline-open-only"
      aria-pressed={openOnly}
      onClick={() => onOpenOnly(!openOnly)}
      className={cn(
        // 머리의 다른 단추와 같은 32px — 칩만 작으면 다른 종류처럼 보인다
        'focus-ring inline-flex h-8 items-center rounded px-2.5 text-caption',
        openOnly ? 'bg-primary/15 text-primary-ink' : 'text-muted-foreground hover:text-label'
      )}
    >
      {t.wikiPanes.outline.openOnly}
    </button>
  )
}

const OutlineList = ({
  rows,
  active,
  onJump
}: {
  rows: Row[]
  active: string | null
  onJump: (id: string) => void
}): React.JSX.Element => {
  const t = useT()
  return (
    <nav aria-label={t.wikiPanes.outline.nav} className="flex flex-col gap-px">
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          data-testid={`outline-row:${row.id}`}
          aria-current={row.id === active ? 'location' : undefined}
          title={row.text}
          onClick={() => onJump(row.id)}
          style={{ paddingLeft: `${(Math.min(row.level, 4) - 1) * 10 + 6}px` }}
          className={cn(
            'focus-ring flex w-full items-center gap-1.5 rounded py-1 pr-1.5 text-left text-caption',
            row.id === active
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-label'
          )}
        >
          {row.changed && (
            <span
              data-testid="outline-changed"
              aria-label={t.wikiPanes.outline.changed}
              className="size-1.5 shrink-0 rounded-full bg-primary"
            />
          )}
          <span className="min-w-0 flex-1 truncate">{row.text}</span>
          {row.total > 0 && (
            <span
              data-testid="outline-progress"
              className={cn(
                'shrink-0 tabular-nums',
                row.done === row.total ? 'text-primary-ink' : undefined
              )}
            >
              {row.done}/{row.total}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}

/**
 * 목차를 그릴 것이 있는가 — 헤딩도 체크박스도 없는 짧은 노트에는 띄우지 않는다.
 * 헤딩 없는 체크리스트에는 절 행이 없어도 띄운다: "열린 항목만" 이 이 안에만 있다.
 */
const worthShowing = (outline: Outline): boolean => outline.rows.length > 1 || outline.total > 0

/** 리더 오른쪽 가장자리의 고정 목차 — 중앙이 좁으면 자리를 비우고 헤더의 `OutlineMenu` 가 맡는다 */
export const OutlinePane = (props: OutlineProps): React.JSX.Element | null => {
  const t = useT()
  const outline = useMemo(() => outlineFor(props.text, props.marks), [props.text, props.marks])
  const ids = useMemo(() => outline.rows.map((row) => row.id), [outline])
  const active = useActiveSection(props.scrollRef, ids)
  if (!worthShowing(outline)) return null
  return (
    <aside
      data-testid="outline-pane"
      className="sticky top-0 hidden w-52 shrink-0 pt-12 pb-24 @[58rem]:block"
    >
      <div className="flex items-center justify-between gap-2 px-1.5 pb-1">
        <span className="text-caption text-muted-foreground">{t.wikiPanes.outline.title}</span>
        <OpenOnlyToggle openOnly={props.openOnly} onOpenOnly={props.onOpenOnly} />
      </div>
      <OutlineList
        rows={outline.rows}
        active={active}
        onJump={(id) => jumpTo(props.scrollRef.current, id)}
      />
    </aside>
  )
}

/** 좁은 중앙에서의 목차 — 헤더 버튼으로 여닫는다 */
export const OutlineMenu = (props: OutlineProps): React.JSX.Element | null => {
  const t = useT()
  const [open, setOpen] = useState(false)
  const outline = useMemo(() => outlineFor(props.text, props.marks), [props.text, props.marks])
  const ids = useMemo(() => outline.rows.map((row) => row.id), [outline])
  const active = useActiveSection(props.scrollRef, ids)
  if (!worthShowing(outline)) return null
  return (
    <div className="relative @[58rem]:hidden">
      <Button
        variant="outline"
        size="sm"
        data-testid="outline-menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <ListTree aria-hidden /> {t.wikiPanes.outline.title}
      </Button>
      {open && (
        <div
          data-testid="outline-menu-panel"
          className="absolute right-0 top-full z-20 mt-1 max-h-96 w-64 overflow-y-auto rounded-md border border-hairline bg-elevated p-1.5 shadow-lg"
        >
          <div className="flex justify-end pb-1">
            <OpenOnlyToggle openOnly={props.openOnly} onOpenOnly={props.onOpenOnly} />
          </div>
          <OutlineList
            rows={outline.rows}
            active={active}
            onJump={(id) => {
              jumpTo(props.scrollRef.current, id)
              setOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
