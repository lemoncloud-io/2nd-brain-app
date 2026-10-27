// 그래프 탭(슬라이스 08) — wikilink 그래프, 이어진 수 등급 색, 호버 이웃 강조, 노드 클릭 시 고르고 옆 칸에서 읽기.
// 그리는 일은 렌더러(graph-canvas-3d)가 맡고, 여기서는 데이터·필터·카메라만 엮는다.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Waypoints } from 'lucide-react'
import { buildGraph, type WikiGraph } from '../../../shared/wiki/graph'
import { EmptyState, ViewHeader } from '../components/layout/view'
import { GraphToolbar } from './graph-toolbar'
import type { GraphFilter } from '../lib/graph-filter'
import type { GrowthState } from '../lib/graph-growth'
import { useNextStep } from '../hooks/use-next-step'
import { useWorkbench } from '../store/workbench'
import { toUserError, type UserError } from '../lib/user-error'
import type { GraphCamera, GraphCanvas3D as GraphCanvas3DType } from './graph-canvas-3d'
import { GraphLoading } from './graph-loading'
import { GraphErrorBoundary } from './graph-error-boundary'
import { getT, useT } from '../lib/i18n'

// three.js 는 무겁다 — 앱 첫 화면 묶음에 싣지 않고 그래프 탭이 따로 받는다.
// lazy 는 실패한 약속을 기억한다 — 한 번 못 받으면 같은 lazy 로는 영영 다시 못 받으므로,
// 다시 해 볼 때는 lazy 자체를 새로 만든다
const load3D = (): ReturnType<typeof lazy> =>
  lazy(() => import('./graph-canvas-3d').then((m) => ({ default: m.GraphCanvas3D })))

/**
 * 캔버스의 키보드 대안 — 캔버스는 그림이라 점을 탭으로 짚을 수 없다.
 * 화면에서는 접혀 있고, 펴면 페이지 이름 버튼으로 같은 근거 칸을 연다.
 */
const GraphNodeList = ({
  graph,
  onSelect
}: {
  graph: WikiGraph
  onSelect: (rel: string) => void
}): React.JSX.Element => {
  const t = useT()
  return (
    <details className="border-t border-hairline px-4 py-2" data-testid="graph-node-list">
      <summary className="focus-ring cursor-pointer rounded-sm text-caption text-label">
        {t.graph.pickFromList}
      </summary>
      <ul className="mt-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto">
        {graph.nodes
          .filter((node) => !node.ghost && node.rel !== null)
          .map((node) => (
            <li key={node.key}>
              <button
                type="button"
                onClick={() => onSelect(node.rel as string)}
                className="focus-ring tactile rounded-md border border-hairline px-2 py-0.5 text-caption text-label hover:bg-accent"
              >
                {node.label}
              </button>
            </li>
          ))}
      </ul>
    </details>
  )
}

export const GraphView = (): React.JSX.Element => {
  const t = useT()
  const [entries, setEntries] = useState<Awaited<
    ReturnType<typeof window.api.listGraphPages>
  > | null>(null)
  const [error, setError] = useState<UserError | null>(null)
  const openPeek = useWorkbench((s) => s.openPeek)
  // 옆 칸에서 읽는 페이지 — 그래프가 그 점을 고른 채로 보여 준다
  const focusRel = useWorkbench((s) => s.peek?.rel ?? null)
  const closePeek = useWorkbench((s) => s.closePeek)
  const next = useNextStep()
  // 3D 를 받아 오는 lazy 와 몇 번째 시도인지 — 실패하면 둘 다 새로 만든다
  const [loader, setLoader] = useState(() => ({ Canvas: load3D(), attempt: 0 }))
  const GraphCanvas3D = loader.Canvas as typeof GraphCanvas3DType
  // 렌더러가 못 떴다 — 청크를 못 받았거나 WebGL 이 없다. 까닭을 적고 "다시 그리기" 를 낸다
  const onRendererError = useCallback((e: unknown): void => {
    setError(toUserError(e, getT().graph.failed))
    // 다시 그릴 때는 새 lazy 로 처음부터 받는다
    setLoader((prev) => ({ Canvas: load3D(), attempt: prev.attempt + 1 }))
  }, [])
  const [chosen, setFilter] = useState<GraphFilter>({
    kinds: new Set(['page', 'system', 'ghost']),
    community: null
  })
  const camera = useRef<GraphCamera | null>(null)
  const onCamera = useCallback((next: GraphCamera | null): void => {
    camera.current = next
  }, [])
  // 성장 연출 상태 — 캔버스가 알려 주고 툴바 버튼이 그대로 보인다
  const [growth, setGrowth] = useState<GrowthState>('unready')
  // D 성장 재생, Esc 옆 칸 닫기 — 글자를 치는 중에는 건드리지 않는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target && (target.closest('input, textarea, select') || target.isContentEditable)) return
      if (e.key === 'Escape') closePeek()
      else if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey) {
        camera.current?.toggleGrowth()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closePeek])
  // 다시 그리기 — 같은 effect 를 한 번 더 태운다
  const [reloadAt, setReloadAt] = useState(0)

  useEffect(() => {
    let stale = false
    const load = async (): Promise<void> => {
      try {
        const result = await window.api.listGraphPages()
        if (stale) return
        if ('error' in result) {
          setError(toUserError(result.error, getT().graph.failed))
          setEntries(null)
        } else {
          setError(null)
          setEntries(result)
        }
      } catch (e) {
        if (!stale) {
          setError(toUserError(e, getT().graph.failed))
          setEntries(null)
        }
      }
    }
    void load()
    // 탭은 숨긴 채 마운트돼 있다 — 위키 변경·볼트 전환(빈 묶음) 신호로 다시 읽는다.
    // 그래프는 볼트 전체 md를 보니 md 변경이면 어디든 다시 읽는다
    const off = window.api.onWikiChanged((rels) => {
      if (rels.length === 0 || rels.some((r) => r.toLowerCase().endsWith('.md'))) void load()
    })
    return () => {
      stale = true
      off()
    }
  }, [reloadAt])

  const graph = useMemo(() => {
    if (!entries || 'error' in entries) return null
    if (entries.length === 0) return null
    return buildGraph(entries)
  }, [entries])

  // 다시 읽어 묶음 번호가 바뀌면 고른 번호가 아무것도 안 가리킬 수 있다 — 그때는 전체로 읽는다
  const filter: GraphFilter =
    chosen.community !== null && graph && !graph.communities.some((c) => c.id === chosen.community)
      ? { ...chosen, community: null }
      : chosen

  const weakCommunities = graph?.communities.filter((c) => c.weak).length ?? 0
  // 노드를 누르면 그래프를 두고 옆에서 읽는다
  const onSelect = openPeek

  return (
    <>
      <ViewHeader title={t.graph.title} description={t.graph.description} />
      {graph && (
        <GraphToolbar
          graph={graph}
          filter={filter}
          onFilter={setFilter}
          onRefresh={() => setReloadAt(Date.now())}
          onFit={() => camera.current?.fit()}
          growth={growth}
          onGrowth={() => camera.current?.toggleGrowth()}
        />
      )}
      {/* 캔버스는 화면 전체를 쓴다 — ViewBody(max-w-3xl·overflow) 대신 직접 배치 */}
      <div className="@container relative flex min-h-0 flex-1 flex-col" data-testid="graph-view">
        {error && (
          <EmptyState
            icon={Waypoints}
            title={error.text}
            description={t.graph.failedHint}
            action={{
              label: t.graph.redraw,
              testId: 'graph-retry',
              onClick: () => setReloadAt(Date.now())
            }}
          />
        )}
        {entries === null && !error && <GraphLoading />}
        {entries !== null && !graph && !error && (
          <EmptyState
            icon={Waypoints}
            title={t.graph.emptyTitle}
            description={t.graph.emptyHint}
            action={next}
          />
        )}
        {graph && !error && (
          <div className="relative flex min-w-0 flex-1 flex-col">
            {/* key 가 시도마다 새 boundary 를 만든다 — 다시 그리면 새 시도가 된다 */}
            <GraphErrorBoundary key={loader.attempt} onError={onRendererError}>
              <Suspense fallback={<GraphLoading />}>
                <GraphCanvas3D
                  graph={graph}
                  filter={filter}
                  onCamera={onCamera}
                  onSelect={onSelect}
                  onGrowth={setGrowth}
                  focusRel={focusRel}
                  onClear={closePeek}
                />
              </Suspense>
            </GraphErrorBoundary>
            {/* 캔버스는 그림이라 키보드로 점을 고를 수 없다 — 같은 동작을 이름 목록으로 준다 */}
            <GraphNodeList graph={graph} onSelect={onSelect} />
            {weakCommunities > 0 && (
              <p
                className="pointer-events-none absolute bottom-3 left-4 text-caption text-muted-foreground"
                data-testid="graph-weak"
              >
                {t.graph.weak(weakCommunities)}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
