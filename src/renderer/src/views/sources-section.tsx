// 지식 관리의 자료 구역 — 웹·파일 자료를 넣는 곳이다. 넣기 → 기다리는 목록(빼기) 순서로 할 일을 따라 내려간다.
// 위키화 시작·진행·결과는 옆 칸 위키화 탭 한 곳이 쥔다 — 여기서 시작하면 이 화면은 아무것도 안 바뀐 채
// 옆 칸만 바뀌어 "눌렀나?" 가 됐다(2026-09-18 사람 확인). 여기서는 그 탭으로 가는 길만 준다.
import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { ClipSection } from '../pages/ClipSection'
import { useSetup } from '../hooks/use-setup'
import { useWorkbench } from '../store/workbench'
import { waitingClippings } from '../lib/clippings'
import { WaitingClippings } from '../components/waiting-clippings'
import { useT } from '../lib/i18n'

export const SourcesSection = (): React.JSX.Element => {
  const t = useT()
  const setup = useSetup()
  const openChat = useWorkbench((s) => s.openChat)
  // 위키화 탭과 같은 목록 — 트리를 못 읽었을 때만 main 이 센 수로 말한다
  const tree = useWorkbench((s) => s.tree)
  const list = useMemo(() => (tree === null ? null : waitingClippings(tree)), [tree])
  const waiting = list?.length ?? setup.journey?.clippings ?? 0

  return (
    <div
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-10"
      data-testid="sources-section"
    >
      <div className="mx-auto flex max-w-xl flex-col gap-8">
        <section data-testid="sources-guide" id="sources-guide" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-title">{t.sources.title}</h1>
            <p className="text-callout text-label">{t.sources.intro}</p>
          </div>
          <ClipSection />
        </section>

        <section className="flex flex-col gap-2" data-testid="sources-waiting">
          <div className="flex items-baseline gap-3">
            <h2 className="min-w-0 flex-1 text-heading">
              {t.sources.waitingTitle}{' '}
              {list !== null && (
                <span className="text-muted-foreground tabular-nums">{waiting}</span>
              )}
            </h2>
            {list !== null && waiting > 0 && (
              <button
                type="button"
                data-testid="sources-open-ingest"
                onClick={() => openChat('ingest', { focus: true })}
                className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-sm text-callout text-primary-ink hover:underline"
              >
                {t.sources.goIngest} <ArrowRight aria-hidden className="size-3.5" />
              </button>
            )}
          </div>
          {list === null ? (
            <p
              role="status"
              data-testid="sources-loading"
              className="text-callout text-muted-foreground"
            >
              {t.shell.reading}
            </p>
          ) : list.length > 0 ? (
            <WaitingClippings items={list} testId="sources-waiting-list" removable />
          ) : (
            <div data-testid="sources-empty" className="flex flex-col items-start gap-1">
              <p className="text-callout text-muted-foreground">{t.sources.waitingEmpty}</p>
              <a
                href="#sources-guide"
                className="focus-ring rounded-sm text-callout text-primary-ink hover:underline"
              >
                {t.sources.backToAdd}
              </a>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
