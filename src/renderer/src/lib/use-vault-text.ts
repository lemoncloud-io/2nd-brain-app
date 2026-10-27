// 보관함 파일의 글자를 vault:// 로 읽는다 — 미리보기 여럿이 같이 쓴다(글·json·html).
import { useEffect, useState } from 'react'
import { toUserError, type UserError } from './user-error'
import { vaultUrl } from '../../../shared/vault-file-types'
import { getT } from './i18n'

const LOAD_TIMEOUT_MS = 15000

export const useVaultText = (rel: string): { text: string | null; error: UserError | null } => {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<UserError | null>(null)

  useEffect(() => {
    let cancelled = false
    // 응답이 영영 안 오면 "불러오는 중" 이 막다른 길이 된다 — 기다림에 끝을 둔다
    const timer = setTimeout(() => {
      if (!cancelled) setError(toUserError(new Error(getT().doc.tooSlow), getT().doc.readFailed))
    }, LOAD_TIMEOUT_MS)
    void fetch(vaultUrl(rel))
      .then(async (res) => {
        if (!res.ok) throw new Error(getT().doc.loadFailed(res.status))
        return res.text()
      })
      .then((value) => {
        if (!cancelled) setText(value)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toUserError(err, getT().doc.readFailed))
      })
      .finally(() => clearTimeout(timer))
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [rel])

  return { text, error }
}
