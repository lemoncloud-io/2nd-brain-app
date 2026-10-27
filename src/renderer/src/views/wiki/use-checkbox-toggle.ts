// 리더에서 체크박스를 누르면 원문의 그 줄이 바뀐다 — 편집기를 열지 않고 하루 루프를 굴리는 길.
//
// 리더가 그리는 글은 frontmatter 와 제목 줄을 뗀 본문이라 줄 번호가 원문과 어긋난다. 뗀 줄 수를
// 더해 원문 줄을 구하고, 그 줄이 체크박스 모양일 때만 쓴다. 남이 그새 고쳤으면(해시 불일치)
// 다시 읽어 그 판 위에 한 번 더 시도한다 — 남의 변경을 덮지 않는다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { WikiReadResult } from '../../../../shared/ipc-contract'
import { toggleCheckbox } from '../../lib/plan-outline'
import { toUserError } from '../../lib/user-error'
import { withoutTitleHeading } from './use-wiki-read'
import { getT } from '../../lib/i18n'

export type WikiWriteApi = Pick<Window['api'], 'readWikiPage' | 'writeWikiPage'>

/** 원문에서 리더가 떼어 낸 앞부분 줄 수 — 본문 줄 + 이 수 = 원문 줄 */
export const readerOffset = (read: WikiReadResult): number =>
  read.text.split('\n').length -
  withoutTitleHeading(read.page.body, read.page.title).split('\n').length

/** 그 판에서 이 줄을 뒤집은 글 — 줄이 체크박스 모양이 아니면 null */
const toggledText = (read: WikiReadResult, bodyLine: number): string | null =>
  toggleCheckbox(read.text, bodyLine + readerOffset(read))

/** 그 판에서 이 줄의 원문 — 없는 줄이면 undefined */
const lineOf = (read: WikiReadResult, bodyLine: number): string | undefined =>
  read.text.split('\n')[bodyLine + readerOffset(read) - 1]

/**
 * 체크박스 한 칸 저장. 실패는 사유를 돌려준다 — 부르는 쪽이 사람에게 보이고 문서를 다시 읽는다.
 * @param bodyLine 리더가 그린 글 기준 줄 번호(1-based)
 */
export const saveToggle = async (
  api: WikiWriteApi,
  read: WikiReadResult,
  bodyLine: number
): Promise<{ ok: true } | { error: string }> => {
  const text = toggledText(read, bodyLine)
  if (text === null) return { error: getT().wikiDoc.checkMismatch }
  const wrote = await api.writeWikiPage(read.page.rel, text, read.hash)
  if ('ok' in wrote) return { ok: true }

  // 거절 사유는 해시 불일치일 수도, 잠금일 수도 있다 — 한 번은 최신 판 위에서 다시 해 본다
  const fresh = await api.readWikiPage(read.page.rel)
  if ('error' in fresh) return { error: fresh.error }
  // 남이 그 줄 위에 항목을 끼워 넣었으면 같은 줄 번호는 다른 항목이다 — 글자가 같을 때만 다시 쓴다
  if (lineOf(fresh, bodyLine) !== lineOf(read, bodyLine))
    return { error: getT().wikiDoc.checkMismatch }
  const next = toggledText(fresh, bodyLine)
  if (next === null) return { error: getT().wikiDoc.checkMismatch }
  const again = await api.writeWikiPage(fresh.page.rel, next, fresh.hash)
  return 'ok' in again ? { ok: true } : { error: again.error }
}

export type CheckboxToggle = {
  /** 리더가 그린 글 기준 줄 번호 */
  toggle: (bodyLine: number) => void
  error: string | null
}

/**
 * 누른 순서대로 한 칸씩 저장한다 — 두 칸을 잇달아 누르면 뒤엣것이 앞엣것의 판 위에서 돈다.
 * 나란히 보내면 뒤엣것의 해시가 늘 어긋나 재시도로 흘러가고, 그 사이 트리·리더가 두 번 새로 온다.
 *
 * `toggle` 은 변하지 않는다 — 리더는 이 함수가 바뀌면 본문을 다시 마운트한다(wikilink-markdown).
 * 그래서 지금 판(`read`)은 프롭이 아니라 최신 값을 담아 둔 상자에서 읽는다.
 */
export const useCheckboxToggle = (
  read: WikiReadResult | null,
  reload: () => void
): CheckboxToggle => {
  const [error, setError] = useState<string | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const latest = useRef<{ read: WikiReadResult | null; reload: () => void }>({ read, reload })
  useEffect(() => {
    latest.current = { read, reload }
  }, [read, reload])

  const toggle = useCallback((bodyLine: number) => {
    const { read: current, reload: refresh } = latest.current
    if (current === null) return
    queue.current = queue.current.then(async () => {
      try {
        const result = await saveToggle(window.api, current, bodyLine)
        setError('error' in result ? result.error : null)
      } catch (err) {
        setError(toUserError(err, getT().wikiDoc.checkSaveFailed).text)
      }
      // 성공이든 실패든 디스크가 정본이다 — 화면을 그 판으로 맞춘다
      refresh()
    })
  }, [])

  return { toggle, error }
}
