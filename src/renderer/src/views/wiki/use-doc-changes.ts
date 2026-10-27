// 리더가 보이는 "바뀐 곳" 한 벌 — 기준이 바뀌거나 문서를 다시 읽으면 다시 묻는다.
import { useEffect, useState } from 'react'
import { changedMidway, type ChangeSince, type DocChanges } from '../../../../shared/ipc-contract'
import { getT } from '../../lib/i18n'

export type DocChangesState = {
  changes: DocChanges | null
  /** 기준 기록이 없거나 읽지 못한 이유 — 있으면 표시하지 않는다 */
  unavailable: string | null
  /** 아직 답을 기다린다 — "바뀐 곳이 없다" 와 같은 화면이 되지 않게 가른다 */
  loading: boolean
}

const NONE: DocChangesState = { changes: null, unavailable: null, loading: false }
const ASKING: DocChangesState = { changes: null, unavailable: null, loading: true }

/**
 * @param rel 지금 리더가 연 문서
 * @param since 고른 기준 — 없으면 묻지 않는다
 * @param version 문서를 다시 읽었다는 표(내용 해시) — 저장·바깥 변경 뒤 표시를 새로 받는다
 */
export const useDocChanges = (
  rel: string | null,
  since: ChangeSince | null,
  version: string | undefined
): DocChangesState => {
  const [state, setState] = useState<DocChangesState & { token: string | null }>({
    token: null,
    ...NONE
  })
  // since 는 객체라 값이 같아도 새 참조가 온다 — 무엇을 물었는지 한 줄로 묶는다
  const token =
    rel === null || since === null
      ? null
      : `${rel}|${typeof since === 'object' ? since.change : since}|${version ?? ''}`

  useEffect(() => {
    if (rel === null || since === null || token === null) return
    let stale = false
    window.api
      .docChanges(rel, since)
      .then((result) => {
        if (stale) return
        // 리더가 그리는 내용과 다른 것을 견줬으면 버린다 — 줄 번호가 어긋나 엉뚱한 문단에 막대가 붙는다.
        // 디스크가 바뀐 것이므로 리더도 곧 다시 읽고, 그때 새 해시로 다시 묻는다. 그 사이는 말로 알린다 —
        // 조용히 기다리면 watcher 가 죽었을 때 "묻는 중" 으로 굳는다
        if (!('unavailable' in result) && result.hash !== version) {
          setState({
            token,
            changes: null,
            unavailable: changedMidway(),
            loading: false
          })
          return
        }
        setState(
          'unavailable' in result
            ? { token, changes: null, unavailable: result.unavailable, loading: false }
            : { token, changes: result, unavailable: null, loading: false }
        )
      })
      .catch((error: unknown) => {
        console.error('could not get the changes', error)
        if (!stale) {
          setState({
            token,
            changes: null,
            unavailable: getT().noteRun.changes.failed,
            loading: false
          })
        }
      })
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // 다른 문서·다른 기준의 답은 버린다. 아직 못 받았으면 "묻는 중" 이다 — "바뀐 곳이 없다" 가 아니다
  if (token === null) return NONE
  return state.token === token ? state : ASKING
}
