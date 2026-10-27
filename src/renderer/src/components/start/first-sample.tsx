import { useRef, useState } from 'react'
import { FlaskConical, LoaderCircle } from 'lucide-react'
import { Button } from '../ui/button'
import { ErrorNote } from '../error-note'
import { saveFirstSample } from '../../lib/first-sample'
import { useSetup } from '../../hooks/use-setup'
import { toUserError } from '../../lib/user-error'
import { getT, useT } from '../../lib/i18n'

/**
 * 예시 글로 해보기 — 손에 쥔 파일이 없어도 3걸음을 돌아보게 한다.
 * 바깥 글 취급이라 위키화 입력함에 들어가고, 위키에 바로 들어가지 않는다.
 * 넣고 나면 journey를 다시 읽어 3걸음이 다음으로 넘어간다.
 */
export const FirstSample = (): React.JSX.Element => {
  const t = useT()
  const { refreshJourney } = useSetup()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 같은 틱에 두 번 눌러도 한 번만 나간다 — state가 닿기 전 두 번째 클릭을 막는다
  const flying = useRef(false)

  const run = (): void => {
    if (flying.current) return
    flying.current = true
    setBusy(true)
    setError(null)
    void saveFirstSample()
      .then((result) => {
        if (result.ok) refreshJourney()
        else setError(result.reason)
      })
      .catch((e: unknown) => setError(toUserError(e, getT().library.sampleFailed).text))
      .finally(() => {
        setBusy(false)
        flying.current = false
      })
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button size="sm" variant="outline" data-testid="first-sample" disabled={busy} onClick={run}>
        {busy ? (
          <LoaderCircle className="animate-spin" aria-hidden />
        ) : (
          <FlaskConical aria-hidden />
        )}
        {busy ? t.vaultSetup.sampleAdding : t.vaultSetup.sampleTry}
      </Button>
      <p className="text-caption text-muted-foreground">{t.vaultSetup.sampleNote}</p>
      {error !== null && (
        <ErrorNote error={{ text: error, detail: null }} testId="first-sample-error" />
      )}
    </div>
  )
}
