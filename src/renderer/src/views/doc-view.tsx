// 중앙 문서 자리 — md 는 리더가, 그 밖의 파일은 미리보기가 그린다.
// 둘 다 같은 자리를 쓰므로 트리에서 무엇을 눌러도 화면이 갈아엎어지지 않는다.
import { useWorkbench } from '../store/workbench'
import { fileTitle, folderLabel } from '../lib/vault-path'
import { SourcePreview } from './source-preview'
import { WikiView } from './wiki/wiki-view'
import { SplitPane } from './wiki/split-pane'
import { useT } from '../lib/i18n'

export const DocView = (): React.JSX.Element => {
  const t = useT()
  const docMode = useWorkbench((s) => s.docMode)
  const selectedSource = useWorkbench((s) => s.selectedSource)
  const selectedPage = useWorkbench((s) => s.selectedPage)
  const split = useWorkbench((s) => s.split)

  // 트리에서 옮겨 다니면 초점은 트리에 둔 채 무엇을 열었는지만 알린다 — 초점을 빼앗으면 키보드 탐색이 끊긴다
  const rel = docMode === 'source' ? selectedSource : selectedPage
  const name = rel === null ? t.views.doc : fileTitle(rel)
  const announce = (
    <p role="status" className="sr-only" data-testid="doc-announce">
      {rel === null ? '' : t.today.docOpened(folderLabel(rel))}
    </p>
  )
  const center =
    docMode === 'source' && selectedSource !== null ? (
      <SourcePreview rel={selectedSource} />
    ) : (
      <WikiView />
    )
  // 탭 띠가 가리키는 패널은 여기 하나다 — 탭의 aria-controls 와 같은 id 다
  const panel = (
    <div
      id="doc-panel"
      role="tabpanel"
      aria-label={name}
      className="flex min-h-0 min-w-72 flex-1 flex-col"
    >
      {announce}
      {center}
    </div>
  )
  if (split === null) return panel
  // 좌우 분할 — 좁으면 쌓는다. 두 칸 다 min-w-72 라 자리(540px+)가 없으면 다음 줄로 내려간다
  return (
    <div className="scrollbar-thin flex min-h-0 flex-1 flex-wrap overflow-y-auto">
      {panel}
      <SplitPane rel={split} />
    </div>
  )
}
