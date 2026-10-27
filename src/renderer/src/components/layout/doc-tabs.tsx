// 중앙 자리의 탭 띠 — 문서를 여러 장 띄워 놓고 오간다(Obsidian 과 같은 모양).
// 사이드바·채팅 토글과 한 줄을 쓴다 — 탭을 위해 화면 높이를 더 내주지 않는다.
import { Globe, Plus, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useWorkbench } from '../../store/workbench'
import { tabLabel, tabLabels, type Tab } from '../../store/tabs'
import { useT } from '../../lib/i18n'

/** 탭에 마우스를 올렸을 때 보이는 원문 — 파일이면 보관함 안의 자리 */
const tabTitle = (tab: Tab): string => {
  if (tab.view === 'web') return tab.web?.url ?? tabLabel(tab)
  const rel = tab.docMode === 'source' ? tab.source : tab.page
  return rel ?? tabLabel(tab)
}

export const DocTabs = (): React.JSX.Element => {
  const t = useT()
  const tabs = useWorkbench((s) => s.tabs)
  const tabAt = useWorkbench((s) => s.tabAt)
  const openTab = useWorkbench((s) => s.openTab)
  const closeTab = useWorkbench((s) => s.closeTab)
  const newTab = useWorkbench((s) => s.newTab)
  // 켜진 탭의 자리는 탭 칸이 아니라 live 필드가 정본이다(store § tabs) — 띠도 그쪽을 읽는다
  const view = useWorkbench((s) => s.view)
  const page = useWorkbench((s) => s.selectedPage)
  const source = useWorkbench((s) => s.selectedSource)
  const docMode = useWorkbench((s) => s.docMode)
  const web = useWorkbench((s) => s.web)

  const shown: Tab[] = tabs.map((tab, at) =>
    at === tabAt ? { ...tab, view, page, source, docMode, web } : tab
  )
  const labels = tabLabels(shown)
  // 한 장뿐이면 닫기 대신 비운다 — 닫기 단추도 그때는 숨긴다
  const closable = tabs.length > 1
  // 닫은 뒤 초점을 살아남은 탭으로 — 버려진 단추에 두면 body 로 떨어진다.
  // 닫기는 동기라 다시 그리기는 이 틱 뒤에 온다 — 프레임 뒤에 찾는다
  const closeAndFocus = (id: string): void => {
    closeTab(id)
    requestAnimationFrame(() => {
      const alive = document.querySelector('[data-testid="doc-tab"][aria-selected="true"]')
      if (alive instanceof HTMLElement) alive.focus()
    })
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <div
        role="tablist"
        aria-label={t.shell.openTabs}
        data-testid="doc-tabs"
        className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        onKeyDown={(e) => {
          // 탭 줄 규약 — 양옆·처음·마지막. 닫기는 Delete 로(닫은 뒤 이웃 탭이 초점을 받는다)
          if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault()
            const next = shown[e.key === 'Home' ? 0 : shown.length - 1]
            openTab(next.id)
            document.getElementById(`doc-tab-${next.id}`)?.focus()
            return
          }
          if (e.key === 'Delete') {
            const id = (document.activeElement?.id ?? '').replace(/^doc-tab-/, '')
            const target = shown.find((tab) => tab.id === id)
            if (target && closable) {
              e.preventDefault()
              closeAndFocus(target.id)
            }
            return
          }
          const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
          if (step === 0) return
          e.preventDefault()
          const next = shown[(tabAt + step + shown.length) % shown.length]
          openTab(next.id)
          document.getElementById(`doc-tab-${next.id}`)?.focus()
        }}
      >
        {shown.map((tab, at) => (
          <div
            key={tab.id}
            role="tab"
            id={`doc-tab-${tab.id}`}
            data-testid="doc-tab"
            aria-selected={at === tabAt}
            aria-controls={tab.view === 'web' ? 'web-panel' : 'doc-panel'}
            aria-label={tabTitle(tab)}
            tabIndex={at === tabAt ? 0 : -1}
            onClick={() => openTab(tab.id)}
            onKeyDown={(e) => {
              // 단추가 아니라 칸이라 Enter·Space는 여기서 눌러 준다 — 닫기 단추에서 올라온 키는 그 단추가 맡는다
              if (e.target !== e.currentTarget) return
              // ←→·Delete·Home·End는 tablist가 맡는다
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openTab(tab.id)
              }
            }}
            // 가운데 단추로 닫기 — 브라우저·Obsidian 에서 손이 기억하는 동작이다
            onAuxClick={(e) => {
              if (e.button !== 1 || e.target !== e.currentTarget) return
              e.preventDefault()
              closeAndFocus(tab.id)
            }}
            className={cn(
              'focus-ring min-h-8 w-fit max-w-40 shrink-0 cursor-pointer gap-1.5 rounded-md px-2.5 py-1 text-caption',
              'tactile flex items-center',
              at === tabAt
                ? 'bg-accent font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.view === 'web' && <Globe className="size-3.5 shrink-0" aria-hidden />}
            <span className="min-w-0 flex-1 truncate">{labels[at]}</span>
            {/* 닫기는 tablist의 자식이 아니라 탭 안의 단추다 — tablist가 품는 것은 tab뿐이다
              (axe aria-required-children: role 없는 자식은 aria-label 탓에 소유 요소로 세어 위반이 된다).
              닫기 눌림이 탭으로 번지지 않게 막는다 */}
            {closable && (
              <button
                type="button"
                aria-label={t.shell.closeTab(labels[at])}
                data-testid="doc-tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeAndFocus(tab.id)
                }}
                className="focus-ring tactile -my-1 flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-60 hover:bg-background hover:text-foreground hover:opacity-100"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        aria-label={t.shell.newTab}
        aria-keyshortcuts="alt+meta+t"
        data-testid="doc-tab-new"
        onClick={newTab}
        className="focus-ring tactile shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  )
}
