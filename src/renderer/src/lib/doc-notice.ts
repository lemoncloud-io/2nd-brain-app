// 리더 아래 한 줄 알림 — 저장·되돌리기 뒤 "됐다" 를 말한다. 그 문서에만 걸린다:
// 다른 문서로 옮기면 지운다(A 의 "되돌렸어요 · 실행 취소" 가 B 위에 남으면 B 를 되돌리는 것처럼 읽힌다).
// 실행 취소가 없는 알림은 잠깐 보이고 걷힌다 — 실행 취소는 문서를 떠나거나 지울 때까지 둔다.
import { useEffect, useState } from 'react'

export type DocNotice = { rel: string; text: string; undo?: () => void }

/** 잠깐 보이는 알림의 수명(ms) */
export const DOC_NOTICE_MS = 4000

export const useDocNotice = (
  rel: string | null
): [DocNotice | null, (notice: DocNotice | null) => void] => {
  const [notice, setNotice] = useState<DocNotice | null>(null)
  // 문서가 바뀐 렌더에서 바로 지운다 — 이름을 바꾼 저장은 새 이름으로 알림을 세우므로 남는다
  if (notice !== null && notice.rel !== rel) setNotice(null)
  useEffect(() => {
    if (notice === null || notice.undo !== undefined) return
    const timer = setTimeout(() => setNotice(null), DOC_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])
  return [notice, setNotice]
}
