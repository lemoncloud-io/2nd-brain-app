// 지식 관리 — 매일 쓰지 않는 것을 한 페이지에 모았다. 자료·점검·승인·그래프·검색.
// 구역을 옮겨도 언마운트하지 않는다: 그래프 배치·검색 결과·승인 목록을 되짚어 오면 그대로여야 한다.
import { cn } from '../lib/utils'
import { useSetup } from '../hooks/use-setup'
import { useTodayNotes } from '../hooks/use-today'
import { firstRunOf } from '../lib/first-run'
import { useKnowledgeCounts, type KnowledgeCounts } from '../lib/knowledge-badge'
import { useWorkbench, type KnowledgeSection } from '../store/workbench'
import { SourcesSection } from './sources-section'
import { LintView } from './lint-view'
import { ReviewSection } from '../pages/ReviewSection'
import { GraphView } from './graph-view'
import { SearchView } from './search-view'
import { useT } from '../lib/i18n'

const SECTIONS: {
  id: KnowledgeSection
  Content: () => React.JSX.Element
  /** 사이드바 배지에 더해진 수 중 이 구역 몫 — 눌러서 온 자리에 그 수가 보여야 한다 */
  count?: keyof KnowledgeCounts
}[] = [
  { id: 'sources', Content: SourcesSection, count: 'clippings' },
  { id: 'search', Content: SearchView },
  { id: 'graph', Content: GraphView },
  { id: 'lint', Content: LintView, count: 'items' },
  { id: 'review', Content: ReviewSection, count: 'approvals' }
]

// 처음 3걸음을 따라오다 넘어온 사람은 돌아갈 길이 있어야 한다 — 걸음이 남았을 때만 보인다.
// 준비 완료 여부(start-steps)가 아니라 첫걸음 진행(first-run)을 본다: 3걸음은 준비가 끝난 뒤에 뜨므로
// 준비 기준으로는 점프한 화면에서 단추가 절대 안 보였다.
// 구독을 이 자식에 가둬 부모(5구역+탭줄)가 setup 틱마다 다시 그려지지 않게 한다
const KnowledgeBackButton = (): React.JSX.Element | null => {
  const t = useT()
  const setView = useWorkbench((s) => s.setView)
  const tree = useWorkbench((s) => s.tree)
  const setup = useSetup()
  const { today } = useTodayNotes()
  // start-view.tsx 의 FirstSteps 와 같은 식 — 오늘 노트·위키화·승인을 다 마쳤으면 돌아갈 3걸음이 없다
  const first = firstRunOf(tree, today?.rel ?? null, setup.journey)
  if (first.checking || first.complete) return null
  return (
    <button
      type="button"
      data-testid="knowledge-back-start"
      onClick={() => setView('start')}
      className="focus-ring ml-auto min-h-8 shrink-0 rounded-sm px-2 py-1 text-caption text-primary-ink hover:underline"
    >
      {t.knowledge.backToStart}
    </button>
  )
}

export const KnowledgeView = (): React.JSX.Element => {
  const t = useT()
  const section = useWorkbench((s) => s.knowledgeSection)
  const openKnowledge = useWorkbench((s) => s.openKnowledge)
  const counts = useKnowledgeCounts()

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="knowledge-view">
      <div className="flex h-13 min-w-0 shrink-0 items-center gap-2 overflow-x-auto border-b border-hairline px-4">
        <div
          role="tablist"
          aria-label={t.views.knowledge}
          className="flex shrink-0 gap-0.5 rounded-md bg-accent p-0.5"
          onKeyDown={(e) => {
            if (e.key === 'Home' || e.key === 'End') {
              e.preventDefault()
              const next = SECTIONS[e.key === 'Home' ? 0 : SECTIONS.length - 1]
              openKnowledge(next.id)
              document.getElementById(`knowledge-tab-${next.id}`)?.focus()
              return
            }
            const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
            if (step === 0) return
            e.preventDefault()
            const at = SECTIONS.findIndex((entry) => entry.id === section)
            const next = SECTIONS[(at + step + SECTIONS.length) % SECTIONS.length]
            openKnowledge(next.id)
            document.getElementById(`knowledge-tab-${next.id}`)?.focus()
          }}
        >
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={section === entry.id}
              aria-controls={`knowledge-panel-${entry.id}`}
              aria-label={
                entry.count !== undefined && counts[entry.count] > 0
                  ? t.knowledge.tabCount(
                      t.knowledge.sections[entry.id].label,
                      t.knowledge.sections[entry.id].countWord,
                      counts[entry.count]
                    )
                  : `${t.knowledge.sections[entry.id].label} — ${t.knowledge.sections[entry.id].describe}`
              }
              id={`knowledge-tab-${entry.id}`}
              data-testid={`knowledge-tab-${entry.id}`}
              tabIndex={section === entry.id ? 0 : -1}
              onClick={() => openKnowledge(entry.id)}
              className={cn(
                'focus-ring tactile rounded-sm px-2.5 py-1 text-caption min-h-8',
                section === entry.id
                  ? 'bg-background font-medium text-foreground shadow-raised'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.knowledge.sections[entry.id].label}
              {entry.count !== undefined && counts[entry.count] > 0 && (
                <span
                  aria-hidden
                  data-testid={`knowledge-count-${entry.id}`}
                  className="ml-1 text-primary-ink"
                >
                  {counts[entry.count]}
                </span>
              )}
            </button>
          ))}
        </div>
        <KnowledgeBackButton />
      </div>

      {SECTIONS.map(({ id, Content }) => (
        <div
          key={id}
          id={`knowledge-panel-${id}`}
          role="tabpanel"
          tabIndex={section === id ? 0 : -1}
          aria-labelledby={`knowledge-tab-${id}`}
          className={cn('min-h-0 flex-1 flex-col outline-none', section === id ? 'flex' : 'hidden')}
        >
          <Content />
        </div>
      ))}
    </div>
  )
}
