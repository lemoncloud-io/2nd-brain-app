// 그래프가 자리를 잡는 동안의 표시 — 렌더러와 GraphView(페이지 목록 로딩)가 같이 쓴다.
import { useT } from '../lib/i18n'

export const GraphLoading = (): React.JSX.Element => (
  <div
    data-testid="graph-loading"
    role="status"
    className="text-caption text-muted-foreground absolute inset-0 flex items-center justify-center gap-2"
  >
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
    {useT().graph.loading}
  </div>
)
