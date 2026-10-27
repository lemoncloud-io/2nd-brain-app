import { useCallback, useEffect, useState } from 'react'
import type { RestoreResult, VaultStatus } from '../../../shared/ipc-contract'
import { VaultCreate } from '../components/start/vault-create'
import { AdoptedNote, AdoptOffer } from '../components/start/vault-adopt'
import { SettingsSection, StatusDot } from '../components/layout/settings-section'
import { Button } from '../components/ui/button'
import { useWorkbench } from '../store/workbench'
import { toUserError } from '../lib/user-error'
import { getT, useT } from '../lib/i18n'

const MISSING_LABEL = (missing: string[]): string => {
  const t = getT().vaultSettings
  return missing.length === 0
    ? t.missingUnknown
    : t.missing(missing.map((name) => t.folder[name] ?? name).join(', '))
}

/** 문서 이름만 — 몇 개까지만 보이고 나머지는 수로 */
const NAMES_SHOWN = 3
const docNames = (files: string[]): string => {
  const names = files.map((file) => (file.split('/').pop() ?? file).replace(/\.md$/, ''))
  const shown = names.slice(0, NAMES_SHOWN).join(', ')
  return names.length > NAMES_SHOWN
    ? getT().vaultSettings.namesMore(shown, names.length - NAMES_SHOWN)
    : shown
}

/** 되돌린 뒤 할 말 — 무엇을 챙겨 왔고 무엇이 잠시 안 보이는지 이름으로 */
const doneNote = (carried: string[], awaiting: string[]): string => {
  const t = getT().vaultSettings
  return [
    t.restored,
    carried.length > 0 && t.carried(docNames(carried)),
    awaiting.length > 0 && t.awaitingBack(docNames(awaiting))
  ]
    .filter(Boolean)
    .join(' · ')
}

type Restore =
  { kind: 'note'; text: string } | { kind: 'confirm'; carried: string[]; awaiting: string[] }

function VaultSection(): React.JSX.Element {
  const t = useT()
  const [vault, setVault] = useState<VaultStatus | null>(null)
  // 보관함으로 삼은 결과 — 보관함이 바뀌면 상태를 다시 읽으므로 따로 들고 있는다
  const [adopted, setAdopted] = useState<VaultStatus['adopted']>(undefined)
  const onResult = (status: VaultStatus): void => {
    setVault(status)
    setAdopted(status.adopted)
  }
  const [restore, setRestore] = useState<Restore | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [newWindowError, setNewWindowError] = useState<string | null>(null)

  // IPC 가 예외로 끝나면(main 쪽 예기치 못한 실패) 조용히 삼키지 않고 vault-error 로 보인다
  const showError = (err: unknown): void =>
    setVault((prev) => ({
      ...(prev ?? { vaultDir: null, valid: false, missing: [] }),
      error: toUserError(err, getT().vaultSettings.statusFailed).text
    }))

  const runRestore = (confirmed: boolean): void => {
    setRestore(null)
    setRestoring(true)
    window.api
      .restoreVault(confirmed)
      .then((result: RestoreResult) =>
        setRestore(
          result.status === 'refused'
            ? {
                kind: 'note',
                text: toUserError(result.reason, getT().vaultSettings.restoreFailed).text
              }
            : result.status === 'confirm'
              ? { kind: 'confirm', carried: result.carried, awaiting: result.awaiting }
              : { kind: 'note', text: doneNote(result.carried, result.awaiting) }
        )
      )
      .catch((err: unknown) =>
        setRestore({
          kind: 'note',
          text: toUserError(err, getT().vaultSettings.restoreFailed).text
        })
      )
      .finally(() => setRestoring(false))
  }

  const refresh = useCallback((): void => {
    window.api.getVaultStatus().then(setVault).catch(showError)
    // showError 는 setState 만 부르고 렌더마다 같은 일을 한다 — 의존성으로 넣으면 매 렌더 재구독이다
  }, [])

  // 보관함 전환·변환 버튼의 공통 틀 — 편집기 저장 확인 → 진행 중 표시 → 결과 반영
  const runSwitch = (action: () => Promise<VaultStatus>): void => {
    leaveEditor(() => {
      setSwitching(true)
      action()
        .then(onResult)
        .catch(showError)
        .finally(() => setSwitching(false))
    })
  }

  // 새 창으로 열기 — 지금 창의 보관함은 그대로 두고 고른 보관함을 별도 창에 연다
  const openNewWindow = (): void => {
    setNewWindowError(null)
    setSwitching(true)
    window.api
      .openVaultInNewWindow()
      .then((result) => {
        if (!result.opened && result.error) setNewWindowError(result.error)
      })
      .catch(showError)
      .finally(() => setSwitching(false))
  }

  // 설정 탭은 숨긴 채 마운트돼 있다 — 탭 진입과 볼트 상태 재확인 신호(폴더 삭제 등)에 다시 읽는다
  const view = useWorkbench((s) => s.view)
  // 보관함을 바꾸면 이전 볼트의 편집기는 가리킬 곳이 없어 언마운트된다 — 저장 안 한 글이 있으면 먼저 묻는다
  const leaveEditor = useWorkbench((s) => s.leaveEditor)
  useEffect(() => {
    if (view === 'settings') refresh()
  }, [view, refresh])
  useEffect(
    () =>
      window.api.onWikiChanged((rels) => {
        if (rels.length === 0) refresh()
      }),
    [refresh]
  )

  if (!vault) {
    return (
      <SettingsSection title={t.vaultSettings.title}>
        <div className="flex gap-2">
          <StatusDot tone="idle" />
          <p data-testid="vault-status" className="text-callout text-muted-foreground">
            {t.shell.checking}
          </p>
        </div>
      </SettingsSection>
    )
  }

  // 최근 보관함 — 지금 창 것은 뺀다. 새 창으로 열기는 위 버튼으로
  const recents = (vault?.recentVaults ?? []).filter((dir) => dir !== vault?.vaultDir)

  return (
    <SettingsSection title={t.vaultSettings.title}>
      {vault.vaultDir === null ? (
        <>
          <div className="flex gap-2">
            <StatusDot tone="idle" />
            <p data-testid="vault-status" className="text-callout text-muted-foreground">
              {t.vaultSettings.none}
            </p>
          </div>
          <div className="mt-3">
            <VaultCreate onResult={onResult} />
          </div>
        </>
      ) : vault.valid ? (
        <>
          <div className="flex gap-2">
            <StatusDot tone="ok" />
            <p data-testid="vault-status" className="min-w-0 wrap-anywhere text-callout text-label">
              {vault.vaultDir}
            </p>
          </div>
          {/* 위키화를 도중에 멈추면 보관함이 평소 상태를 벗어날 수 있다 — 터미널 없이 되돌린다 */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              data-testid="vault-switch"
              disabled={switching}
              onClick={() => runSwitch(() => window.api.openVault())}
            >
              {t.vaultSettings.switch}
            </Button>
            <Button
              size="sm"
              variant="outline"
              data-testid="vault-open-new-window"
              disabled={switching}
              onClick={openNewWindow}
            >
              {t.vaultSettings.newWindow}
            </Button>
            <Button
              size="sm"
              variant="outline"
              data-testid="vault-restore"
              disabled={restoring}
              onClick={() => runRestore(false)}
            >
              {t.vaultSettings.restore}
            </Button>
          </div>
          {/* 두 버튼이 무엇을 하는지 각자 한 줄로 — 한 문단에 섞으면 어느 문장이 어느 버튼인지 모른다 */}
          <ul className="mt-2 flex flex-col gap-1 text-caption text-muted-foreground">
            <li>{t.vaultSettings.switchHint}</li>
            <li>{t.vaultSettings.newWindowHint}</li>
            <li>{t.vaultSettings.restoreHint}</li>
          </ul>
          {/* 최근 보관함 — 지금 창 것만 갈아끼운다. 새 창으로 열기는 위 버튼으로 */}
          {recents.length > 0 && (
            <div className="mt-3">
              <p className="text-caption font-medium text-label">{t.vaultSettings.recents}</p>
              <ul className="mt-1 flex flex-col gap-1">
                {recents.map((dir, index) => (
                  <li key={dir}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-auto max-w-full justify-start px-2 py-1 font-normal"
                      data-testid={`vault-recent-${index}`}
                      disabled={switching}
                      title={dir}
                      onClick={() => runSwitch(() => window.api.openVaultRecent(dir))}
                    >
                      <span className="truncate">
                        {dir.split(/[\\/]/).filter(Boolean).at(-1) ?? dir}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* generic 폴더(읽기 중심) — 위키화 등 뼈대 전제 기능은 안 되고, 보관함으로 쓰기로 변환할 수 있다 */}
          {vault.kind === 'generic' && (
            <div
              data-testid="vault-generic-note"
              className="mt-3 rounded-md border border-border p-3 text-caption text-label"
            >
              <p>{t.vaultSettings.generic}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                data-testid="vault-adopt-generic"
                disabled={switching}
                onClick={() => runSwitch(() => window.api.adoptVault())}
              >
                {t.vaultSettings.adoptGeneric}
              </Button>
            </div>
          )}
          {restore?.kind === 'note' && (
            <p data-testid="vault-restore-note" className="mt-2 text-caption text-muted-foreground">
              {restore.text}
            </p>
          )}
          {/* 떠나기 전에 무엇이 잠시 사라지는지 이름으로 보인다 — 비개발자에게 브랜치 전환은 삭제와 같아 보인다 */}
          {restore?.kind === 'confirm' && (
            <div
              data-testid="vault-restore-confirm"
              className="mt-2 rounded-md border border-border p-3 text-caption text-label"
            >
              <p>{t.vaultSettings.confirm}</p>
              <p className="mt-1 wrap-anywhere text-muted-foreground">
                {t.vaultSettings.awaiting(docNames(restore.awaiting))}
              </p>
              {restore.carried.length > 0 && (
                <p className="mt-1 wrap-anywhere text-muted-foreground">
                  {t.vaultSettings.carry(docNames(restore.carried))}
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="vault-restore-go"
                  disabled={restoring}
                  onClick={() => runRestore(true)}
                >
                  {t.vaultSettings.restoreAnyway}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRestore(null)}>
                  {t.vaultSettings.keep}
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <StatusDot tone="warn" />
            <p data-testid="vault-status" className="min-w-0 wrap-anywhere text-callout text-label">
              {t.vaultSettings.invalid}
              <span className="block text-caption text-muted-foreground">
                {MISSING_LABEL(vault.missing)}
              </span>
              <span className="block wrap-anywhere text-caption text-muted-foreground">
                {vault.vaultDir}
              </span>
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-3 w-full"
            data-testid="vault-open"
            onClick={() =>
              leaveEditor(() => window.api.openVault().then(onResult).catch(showError))
            }
          >
            {t.vaultSettings.reopen}
          </Button>
        </>
      )}
      {/* 볼트가 없을 때는 VaultCreate 가 사유를 보인다 */}
      {vault.error && vault.vaultDir !== null && !vault.adoptable && (
        <p data-testid="vault-error" role="alert" className="mt-3 text-caption text-destructive">
          {vault.error}
        </p>
      )}
      {newWindowError && (
        <p
          data-testid="vault-new-window-error"
          role="alert"
          className="mt-3 text-caption text-destructive"
        >
          {newWindowError}
        </p>
      )}
      {/* 보관함이 없을 때는 VaultCreate 가 같은 제안을 보인다 */}
      {vault.adoptable && vault.vaultDir !== null && (
        <AdoptOffer offer={vault.adoptable} onResult={onResult} />
      )}
      {adopted && vault.valid && <AdoptedNote adopted={adopted} />}
    </SettingsSection>
  )
}

export default VaultSection
