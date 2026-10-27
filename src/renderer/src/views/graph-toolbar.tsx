// 그래프 머리줄과 범례 — 얼마나 큰 그래프인지, 무슨 색이 무엇인지, 무엇만 볼지.
// 색은 코드에만 있으면 해독할 수 없으므로 개수와 함께 화면에 적는다.
import { Maximize, RotateCw, Sprout, Square } from 'lucide-react'
import type { WikiGraph } from '../../../shared/wiki/graph'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'
import { countByKind, KIND_LABEL, type NodeKind } from '../lib/graph-node-look'
import type { GraphFilter } from '../lib/graph-filter'
import { communityTitles, visibleCommunities } from '../lib/graph-community'
import { degreeByKey, STELLAR_ENDS, stellarMost, stellarScale } from '../lib/graph-3d-look'
import { useStage } from '../lib/use-stage'
import type { GrowthState } from '../lib/graph-growth'
import { useT } from '../lib/i18n'

const KINDS: NodeKind[] = ['page', 'system', 'ghost']

export const GraphToolbar = ({
  graph,
  filter,
  onFilter,
  onRefresh,
  onFit,
  growth,
  onGrowth
}: {
  graph: WikiGraph
  filter: GraphFilter
  onFilter: (filter: GraphFilter) => void
  onRefresh: () => void
  onFit: () => void
  growth: GrowthState
  /** 멈춰 있으면 처음부터 재생, 재생 중이면 멈춘다 */
  onGrowth: () => void
}): React.JSX.Element => {
  const t = useT()
  const counts = countByKind(graph)
  const maxDegree = Math.max(0, ...degreeByKey(graph).values())
  const most = stellarMost(maxDegree)
  const shownCommunities = visibleCommunities(graph, filter.community)
  const communityById = new Map(graph.communities.map((community) => [community.id, community]))
  // 범례는 캔버스가 쓰는 바로 그 색표를 띄운다 — 무대가 다르면 색도 다르다
  const scale = stellarScale(useStage())
  const titles = communityTitles(graph)
  const toggleKind = (kind: NodeKind): void => {
    const kinds = new Set(filter.kinds)
    if (kinds.has(kind)) kinds.delete(kind)
    else kinds.add(kind)
    // 전부 끄면 빈 화면이 된다 — 마지막 하나는 끄지 않는다
    if (kinds.size > 0) onFilter({ ...filter, kinds })
  }

  // 한 줄이다 — 줄이 둘로 갈라지면 캔버스가 밀린다. 좁아지면 가로로만 흐른다(세로 줄바꿈 없음).
  // 수는 종류 칩이 들고 있어 개수 줄을 두지 않는다 — 같은 수를 두 번 말하지 않는다.
  // 좁은 폭에서는 범례 순으로 접고(칩에 수가 있다) 단추는 항상 남긴다
  return (
    <div className="flex min-h-11 shrink-0 flex-nowrap items-center gap-2 overflow-x-auto border-b border-hairline px-4 py-1">
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label={t.graph.kindGroup}>
        {KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={filter.kinds.has(kind)}
            data-testid={`graph-kind-${kind}`}
            title={t.graph.kindHint[kind]}
            onClick={() => toggleKind(kind)}
            className={cn(
              'focus-ring tactile inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-caption',
              filter.kinds.has(kind)
                ? 'border-border bg-accent text-foreground'
                : 'border-hairline text-muted-foreground line-through'
            )}
          >
            {KIND_LABEL[kind]} {counts[kind]}
          </button>
        ))}
      </div>

      <div
        className="hidden shrink-0 items-center gap-1.5 text-caption whitespace-nowrap text-muted-foreground lg:flex"
        data-testid="graph-stellar-legend"
        role="img"
        aria-label={t.graph.legendLabel(STELLAR_ENDS.least, most, STELLAR_ENDS.mid)}
        title={t.graph.legendHint(STELLAR_ENDS.mid)}
      >
        {t.graph.legendLinks} {STELLAR_ENDS.least}
        <span
          aria-hidden
          className="h-2 w-16 rounded-full"
          // 부드럽게 이으면 어느 점에도 없는 중간색이 생긴다 — 등급 수만큼 딱딱 끊는다
          style={{
            backgroundImage: `linear-gradient(to right, ${scale
              .map(
                (color, i) =>
                  `${color} ${(i * 100) / scale.length}% ${((i + 1) * 100) / scale.length}%`
              )
              .join(', ')})`
          }}
        />
        {most} {t.graph.legendMid} {STELLAR_ENDS.mid}
      </div>

      <label
        className="flex shrink-0 items-center gap-1.5 text-caption whitespace-nowrap text-muted-foreground"
        title={t.graph.communityHint(shownCommunities.length)}
      >
        {t.graph.community}
        <select
          data-testid="graph-community"
          value={filter.community ?? ''}
          onChange={(e) =>
            onFilter({
              ...filter,
              community: e.target.value === '' ? null : Number(e.target.value)
            })
          }
          className="focus-ring h-7 max-w-44 truncate rounded-md border border-input-border bg-background px-1.5 text-caption text-foreground"
        >
          <option value="">{t.graph.communityAll}</option>
          {shownCommunities.map((id) => (
            <option key={id} value={id}>
              {titles.get(id) ?? t.graph.communityN(id + 1)}
              {communityById.get(id)?.weak ? t.graph.communityWeak : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t.graph.fit}
          title={t.graph.fitHint}
          data-testid="graph-fit"
          onClick={onFit}
        >
          <Maximize aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          // 토글 이름은 고정하고 상태는 aria-pressed 로만 — 둘 다 바꾸면 "재생 멈추기, 눌림" 으로 겹쳐 읽힌다
          aria-label={t.graph.growth}
          aria-pressed={growth === 'playing'}
          aria-keyshortcuts="d"
          // 자리가 잡히는 중에는 재생 전 모습을 저장할 수 없다 — 왜 못 누르는지 툴팁으로 말한다
          title={
            growth === 'unready'
              ? t.graph.growthUnready
              : growth === 'playing'
                ? t.graph.growthStop
                : t.graph.growthPlay
          }
          disabled={growth === 'unready'}
          data-testid="graph-growth"
          onClick={onGrowth}
        >
          {growth === 'playing' ? <Square aria-hidden /> : <Sprout aria-hidden />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t.graph.redraw}
          title={t.graph.redrawHint}
          data-testid="graph-refresh"
          onClick={onRefresh}
        >
          <RotateCw aria-hidden />
        </Button>
      </div>
    </div>
  )
}
