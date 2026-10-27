// 왼쪽 사이드바 — 위에서부터 머리(로고·보관함) · 상태 줄 · 문서 복귀(문서가 아닐 때) · 파일 트리 · 지식 관리 · 설정.
// 아이콘 레일이 아니라 글자다: 처음 여는 사람이 아이콘 뜻을 배우지 않아도 읽을 수 있어야 한다.
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Boxes, ChevronDown, ListChecks, Settings } from 'lucide-react'
import type { AppInfo, EngineStatus, VaultStatus } from '../../../../shared/ipc-contract'
import { cn } from '../../lib/utils'
import { BrandMark } from '../brand-mark'
import { useWorkbench } from '../../store/workbench'
import { useSetup } from '../../hooks/use-setup'
import { setupComplete } from '../../lib/start-steps'
import { knowledgeBadge, knowledgeBadgeLabel, useKnowledgeCounts } from '../../lib/knowledge-badge'
import { SidebarPanes } from './sidebar-panes'
import { PanelResizeHandle } from './panel-resize-handle'
import { StatusDot } from './settings-section'
import { SyncLine } from './sync-line'
import { ShareLine } from './share-line'
import { UpdateRestart } from './update-restart'
import type { PanelWidth } from './use-panel-width'
import { getT } from '../../lib/i18n'
import { useT } from '../../lib/i18n'

const vaultName = (dir: string | null): string =>
  dir === null ? getT().shell.vaultNotChosen : (dir.split('/').filter(Boolean).pop() ?? dir)

type RowButtonProps = {
  id: string
  label: string
  icon: typeof Settings
  active: boolean
  badge?: number
  /** 이름 아래 작은 줄 — 배지 수의 풀이처럼 늘 보여야 하는 것 */
  detail?: string
  /** 마우스를 올리면 보이는 설명 — 줄임말·모음 행에 쓴다 */
  title?: string
  onClick: () => void
}

const RowButton = ({
  id,
  label,
  icon: Icon,
  active,
  badge,
  detail,
  title,
  onClick
}: RowButtonProps): React.JSX.Element => (
  <button
    type="button"
    data-testid={`nav-${id}`}
    aria-current={active ? 'page' : undefined}
    title={title}
    onClick={onClick}
    className={cn(
      'focus-ring tactile flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-callout',
      active ? 'bg-accent text-foreground' : 'text-label hover:bg-accent/60'
    )}
  >
    <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    <span className="min-w-0 flex-1">
      <span className="block truncate">{label}</span>
      {detail && (
        <span
          data-testid={`nav-detail-${id}`}
          className="block line-clamp-2 text-caption text-muted-foreground"
        >
          {detail}
        </span>
      )}
    </span>
    {badge !== undefined && badge > 0 && (
      <span
        data-testid={`nav-badge-${id}`}
        // 수의 뜻은 이름 아래 줄(detail)이 말한다 — 여기서 또 읽지 않는다
        aria-hidden={detail ? true : undefined}
        className="shrink-0 rounded-full bg-primary/15 px-1.5 text-caption text-primary-ink"
      >
        {badge}
      </span>
    )}
  </button>
)

export const Sidebar = ({
  panel,
  shown
}: {
  panel: PanelWidth
  /** 접혀 있어도 언마운트하지 않는다 — 편 폴더·스크롤·센 수가 다시 시작되면 안 된다 */
  shown: boolean
}): React.JSX.Element => {
  const t = useT()
  const view = useWorkbench((s) => s.view)
  const setView = useWorkbench((s) => s.setView)
  const vaultDir = useWorkbench((s) => s.vaultDir)
  const setup = useSetup()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [engine, setEngine] = useState<EngineStatus | null>(null)
  const [vault, setVault] = useState<VaultStatus | null>(null)
  const counts = useKnowledgeCounts()

  const refresh = useCallback((): void => {
    // 이 두 줄은 상태 점 문구만 채운다 — 못 읽으면 "확인 중…" 으로 남고,
    // 실제 안내와 다시 확인은 SetupGate 가 맡는다
    window.api.getEngineStatus().then(setEngine).catch(console.error)
    window.api.getVaultStatus().then(setVault).catch(console.error)
  }, [])

  useEffect(() => {
    window.api.getAppInfo().then(setInfo).catch(console.error)
  }, [])

  // 설정에서 로그인·보관함을 바꾸고 나오면 다시 확인한다
  useEffect(() => {
    if (view !== 'settings') refresh()
  }, [view, refresh])

  // 보관함이 바뀌면 상태 점 문구를 다시 읽는다 — 배지 수는 useKnowledgeCounts 가 센다
  useEffect(
    () =>
      window.api.onWikiChanged((rels) => {
        if (rels.length === 0) refresh()
      }),
    [refresh]
  )

  const engineName = engine?.engine === 'codex' ? 'Codex' : 'Claude'
  const engineOk = engine !== null && !('missing' in engine.cli) && engine.auth.loggedIn
  const engineText =
    engine === null
      ? t.shell.checking
      : 'missing' in engine.cli
        ? t.shell.engineMissing
        : engine.auth.loggedIn
          ? t.shell.engineConnected(engine.auth.email ?? null)
          : t.shell.engineLoggedOut
  const vaultText =
    vault === null
      ? t.shell.checking
      : vault.vaultDir === null
        ? t.shell.vaultNotChosen
        : vault.valid
          ? vault.vaultDir
          : t.shell.vaultBroken(vault.vaultDir)
  const badge = knowledgeBadge(counts)
  // 첫 페이지가 위키에 들어갈 때까지 시작하기를 둔다. 끝난 뒤에도 설정에서 다시 열 수 있으므로,
  // 그렇게 열려 있는 동안에는 보이는 자리에 표시가 있어야 한다
  const showStart = !setupComplete(setup) || view === 'start'

  return (
    <aside
      data-testid="sidebar"
      style={{ width: panel.width }}
      className={cn(
        'relative shrink-0 flex-col border-r border-hairline bg-sidebar',
        shown ? 'flex' : 'hidden'
      )}
    >
      {/* 머리 한 줄 — 로고 + 보관함. 이름은 정적 라벨이 아니라 바꾸는 단추라 펼침 표시를 단다 */}
      <div className="px-2 pt-2 pb-1" data-testid="sidebar-brand">
        <button
          type="button"
          aria-label={t.shell.vaultSettings}
          onClick={() => setView('settings')}
          className="focus-ring tactile flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-accent"
        >
          <BrandMark size={20} />
          <StatusDot
            className="mt-0"
            tone={vault?.vaultDir ? (vault.valid ? 'ok' : 'warn') : 'idle'}
          />
          <span className="min-w-0 flex-1 truncate text-callout font-medium text-foreground">
            {vaultName(vaultDir ?? vault?.vaultDir ?? null)}
          </span>
          {/* 바꾸는 단추라는 것이 보여야 한다 — 이름만 있으면 정적 라벨로 읽힌다 */}
          <span className="shrink-0 text-caption text-muted-foreground">{t.shell.change}</span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
        <p
          data-testid="sidebar-vault"
          title={vaultText}
          className="truncate px-1.5 text-caption text-muted-foreground"
        >
          {vaultText}
        </p>
      </div>
      <SyncLine />
      <ShareLine />
      <UpdateRestart />

      {/* 지식 관리·설정에서 읽던 문서로 돌아오는 길 — 트리에서 파일을 고르지 않아도 제자리다.
          문서 자리에서는 없다 — 그때는 갈 곳이 없는 단추가 된다 */}
      {view !== 'doc' && (
        <div className="shrink-0 px-2 pb-1">
          <button
            type="button"
            data-testid="nav-back-doc"
            onClick={() => setView('doc')}
            className="focus-ring tactile flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-callout text-primary-ink hover:bg-accent"
          >
            <ArrowLeft aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{t.shell.backToDoc}</span>
          </button>
        </div>
      )}

      <SidebarPanes />

      <div className="shrink-0 border-t border-hairline p-1.5">
        {showStart && (
          <RowButton
            id="start"
            label={t.views.start}
            icon={ListChecks}
            active={view === 'start'}
            onClick={() => setView('start')}
          />
        )}
        <RowButton
          id="knowledge"
          label={t.views.knowledge}
          title={t.shell.knowledgeHint}
          icon={Boxes}
          active={view === 'knowledge'}
          badge={badge}
          detail={knowledgeBadgeLabel(counts)}
          onClick={() => setView('knowledge')}
        />
        <RowButton
          id="settings"
          label={t.views.settings}
          icon={Settings}
          active={view === 'settings'}
          onClick={() => setView('settings')}
        />
        <p data-testid="app-version" className="sr-only">
          {info ? t.shell.appVersion(info.version) : t.shell.loading}
        </p>
        {/* 보이는 줄 하나만 — 같은 말을 sr-only 로 한 번 더 두지 않는다 */}
        <p
          data-testid="sidebar-claude"
          className="flex items-center gap-1.5 px-2 py-1 text-caption text-muted-foreground"
        >
          <StatusDot className="mt-0" tone={engine === null ? 'idle' : engineOk ? 'ok' : 'warn'} />
          <span className="truncate">
            {engineName} {engineText}
          </span>
        </p>
      </div>

      <PanelResizeHandle label={t.shell.sidebarWidth} panel={panel} />
    </aside>
  )
}
