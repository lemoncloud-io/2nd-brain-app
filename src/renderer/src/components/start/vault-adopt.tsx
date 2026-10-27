// 이미 쓰던 노트 폴더(Obsidian 보관함 등)를 그대로 두고 보관함으로 쓰기 — 열기에서 고른 폴더가 보관함이 아니고
// 노트가 있을 때 뜬다. 무엇이 더해지고 무엇이 그대로인지 먼저 말하고, 끝나면 위키화로 잇는다.
import { useEffect, useState } from 'react'
import { FolderCheck, Sparkles } from 'lucide-react'
import type { VaultStatus } from '../../../../shared/ipc-contract'
import { useWorkbench } from '../../store/workbench'
import { toUserError } from '../../lib/user-error'
import { Button } from '../ui/button'
import { getT, useT } from '../../lib/i18n'

/** 미리보기에서 보여 줄 파일 수 — 나머지는 수로 */
const PREVIEW_SHOWN = 8

type Preview = { add: string[]; kept: string[]; notes: number }

/** 고른 폴더를 보관함으로 삼기 전 — 버튼 하나와 무엇이 일어나는지 */
export const AdoptOffer = ({
  offer,
  onResult
}: {
  offer: NonNullable<VaultStatus['adoptable']>
  onResult: (status: VaultStatus) => void
}): React.JSX.Element => {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 더해질 파일 미리보기 — main이 실제 adopt와 같은 규칙으로 센다(쓰기는 없다)
  const [preview, setPreview] = useState<Preview | null>(null)
  useEffect(() => {
    let alive = true
    window.api
      .adoptPreview()
      .then((result) => {
        if (alive) setPreview(result)
      })
      .catch(() => {
        if (alive) setPreview(null)
      })
    return () => {
      alive = false
    }
  }, [])

  const adopt = (): void => {
    setBusy(true)
    setError(null)
    window.api
      .adoptVault()
      .then(onResult)
      .catch((e: unknown) => setError(toUserError(e, getT().vaultSetup.adoptFailed).text))
      .finally(() => setBusy(false))
  }

  return (
    <div
      data-testid="vault-adopt-offer"
      className="mt-3 flex flex-col gap-2 rounded-md border border-hairline p-3"
    >
      <p className="text-callout text-label">{t.vaultSetup.adoptTitle}</p>
      <ul className="flex flex-col gap-1 text-caption text-muted-foreground">
        <li>{t.vaultSetup.adoptKeepNotes(offer.notes)}</li>
        <li>{t.vaultSetup.adoptAdds}</li>
        <li>{t.vaultSetup.adoptCopies}</li>
      </ul>
      {preview && preview.add.length > 0 && (
        <div>
          <p className="text-caption text-label">
            {t.vaultSetup.adoptPreview(preview.add.length, preview.notes)}
            {preview.kept.length > 0 && t.vaultSetup.adoptPreviewKept(preview.kept.length)}
          </p>
          <ul
            data-testid="vault-adopt-preview"
            className="mt-1 flex max-h-28 flex-col gap-0.5 overflow-auto text-caption text-muted-foreground"
          >
            {preview.add.slice(0, PREVIEW_SHOWN).map((rel) => (
              <li key={rel} className="wrap-anywhere">
                + {rel}
              </li>
            ))}
            {preview.add.length > PREVIEW_SHOWN && (
              <li>{t.vaultSetup.more(preview.add.length - PREVIEW_SHOWN)}</li>
            )}
          </ul>
        </div>
      )}
      <p className="wrap-anywhere text-caption text-muted-foreground">{offer.dir}</p>
      <div>
        <Button size="sm" data-testid="vault-adopt" disabled={busy} onClick={adopt}>
          <FolderCheck aria-hidden /> {busy ? t.vaultSetup.adopting : t.vaultSetup.adopt}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** 보관함으로 삼은 뒤 — 대기함에 넣은 수와 다음 한 수(위키화) */
export const AdoptedNote = ({
  adopted
}: {
  adopted: NonNullable<VaultStatus['adopted']>
}): React.JSX.Element => {
  const t = useT()
  const openChat = useWorkbench((s) => s.openChat)
  return (
    <div
      data-testid="vault-adopted"
      className="mt-3 flex flex-col gap-2 rounded-md border border-hairline p-3"
    >
      <p className="text-callout text-label">{t.vaultSetup.adopted(adopted.queued)}</p>
      {adopted.kept.length > 0 && (
        <p className="wrap-anywhere text-caption text-muted-foreground">
          {t.vaultSetup.adoptedKept(adopted.kept.join(', '))}
        </p>
      )}
      {adopted.queued > 0 && (
        <div>
          <Button
            size="sm"
            data-testid="vault-adopted-ingest"
            onClick={() => openChat('ingest', { focus: true })}
          >
            <Sparkles aria-hidden /> {t.vaultSetup.adoptedIngest}
          </Button>
        </div>
      )}
    </div>
  )
}
