import { useEffect, useState } from 'react'
import { FolderOpen, LogIn, Unplug } from 'lucide-react'
import {
  useSetupStateSource,
  type EngineReadiness,
  type VaultReadiness
} from '../hooks/use-setup-state'
import { SetupContext, useSetup } from '../hooks/use-setup'
import type { EngineKind } from '../../../shared/engine-settings'
import { useWorkbench, type ViewId } from '../store/workbench'
import { EmptyState } from './layout/view'
import type { Messages } from '../../../shared/i18n'
import { useT } from '../lib/i18n'
import { ENGINE_NAME } from '../lib/install-guide'

export const SetupProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
  <SetupContext.Provider value={useSetupStateSource()}>{children}</SetupContext.Provider>
)

export type SetupNeed = 'vault' | 'engine'

const vaultCopy = (
  t: Messages,
  readiness: Exclude<VaultReadiness, 'ok' | 'checking'>
): [string, string] => (readiness === 'none' ? t.shell.gate.vaultNone : t.shell.gate.vaultInvalid)

// 설정에서 고른 엔진에 맞춰 안내한다 — 설치·로그인은 시작하기가 앱 안에서 이끈다
const engineCopy = (
  t: Messages,
  kind: EngineKind,
  readiness: Exclude<EngineReadiness, 'ok' | 'checking'>
): [string, string] => {
  const name = ENGINE_NAME[kind]
  if (readiness === 'missing') return t.shell.gate.engineMissing(name)
  if (readiness === 'unreadable') return t.shell.gate.engineUnreadable(name)
  return t.shell.gate.engineLoggedOut(name)
}

/**
 * 탭 가드 — 필요한 준비가 끝나기 전에는 탭 내용을 마운트하지 않고 설정으로 가는 버튼을 보여 준다.
 * 준비가 끝나면 그때 마운트되므로 탭은 보관함이 열린 상태에서 처음 데이터를 읽는다.
 */
export const SetupGate = ({
  id,
  needs,
  children
}: {
  /** testid 접두사 — 중앙은 ViewId, 옆 칸은 'chat' 처럼 자기 이름을 준다 */
  id: string
  needs: SetupNeed[]
  children: React.ReactNode
}): React.JSX.Element => {
  const t = useT()
  const setup = useSetup()
  const setView = useWorkbench((s) => s.setView)
  // 확인이 끝나지 않는 경우가 있다 — 몇 초 뒤에는 기다리는 대신 다시 물을 수 있게 한다
  const [slow, setSlow] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 8000)
    return () => clearTimeout(timer)
  }, [attempt])

  const pending =
    (needs.includes('vault') && setup.vault === 'checking') ||
    (needs.includes('engine') && setup.engine === 'checking')
  const blocker =
    needs.includes('vault') && setup.vault !== 'ok' && setup.vault !== 'checking'
      ? { icon: FolderOpen, copy: vaultCopy(t, setup.vault) }
      : needs.includes('engine') && setup.engine !== 'ok' && setup.engine !== 'checking'
        ? { icon: LogIn, copy: engineCopy(t, setup.engineKind, setup.engine) }
        : null

  // 상태를 못 읽었거나 너무 오래 걸리면 갇히지 않게 다시 확인할 길을 준다
  if (pending && (setup.error || slow)) {
    return (
      <div
        data-testid={`setup-failed:${id}`}
        className="flex min-h-0 flex-1 flex-col justify-center"
      >
        <EmptyState
          icon={Unplug}
          title={setup.error ? setup.error.text : t.shell.gate.slow}
          description={t.shell.gate.slowDetail}
          action={{
            label: t.shell.recheck,
            testId: `setup-retry:${id}`,
            onClick: () => {
              setSlow(false)
              setAttempt((n) => n + 1)
              setup.refresh()
            }
          }}
        />
      </div>
    )
  }
  if (blocker) {
    // 볼트가 깨진 경우만 설정 — 나머지 준비는 시작하기가 순서대로 이끈다
    const target: ViewId =
      needs.includes('vault') && setup.vault === 'invalid' ? 'settings' : 'start'
    return (
      <div data-testid={`setup-gate:${id}`} className="flex min-h-0 flex-1 flex-col justify-center">
        <EmptyState
          icon={blocker.icon}
          title={blocker.copy[0]}
          description={blocker.copy[1]}
          action={{
            label: target === 'start' ? t.shell.gate.toStart : t.shell.gate.toSettings,
            testId: `setup-cta:${id}`,
            onClick: () => setView(target)
          }}
        />
      </div>
    )
  }
  if (pending) {
    return (
      <p data-testid={`setup-checking:${id}`} className="text-caption text-muted-foreground p-6">
        {t.shell.gate.checking}
      </p>
    )
  }
  return <>{children}</>
}
