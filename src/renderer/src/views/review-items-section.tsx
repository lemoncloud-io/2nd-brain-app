// 승인 탭 "검토 항목"(슬라이스 12) — AI 점검 발견·검증 결함을 모아 열기·무시.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReviewItem } from '../../../shared/ipc-contract'
import { Button } from '../components/ui/button'
import { useWorkbench } from '../store/workbench'
import { toUserError } from '../lib/user-error'
import { folderLabel } from '../lib/vault-path'
import { getT, useT } from '../lib/i18n'

/** refreshKey 가 바뀌면 다시 읽는다 — 같은 탭 안의 확정이 결함 항목을 더했을 때 */
export const ReviewItemsSection = ({
  refreshKey = 0
}: {
  refreshKey?: number
}): React.JSX.Element => {
  const t = useT()
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [hidden, setHidden] = useState<ReviewItem[]>([])
  const [error, setError] = useState<string | null>(null)
  // 되돌리기 목록 실패 — 본 에러와 합치지 않는다. 못 읽어도 이전 목록은 그대로 둔다
  const [hiddenError, setHiddenError] = useState<string | null>(null)
  // "나중에" 로 보낸 뒤 한 줄 알림 — 접힌 목록을 펼치지 않아도 어디로 갔는지 안다. 다음 새로고침에 지운다
  const [moved, setMoved] = useState(false)
  // "나중에" 로 사라진 자리 — 다시 그린 뒤 초점을 둘 이웃 testid. 실패하면 dismiss 가 비운다
  const focusNext = useRef<string | null>(null)
  const openPeek = useWorkbench((s) => s.openPeek)
  const view = useWorkbench((s) => s.view)
  const section = useWorkbench((s) => s.knowledgeSection)

  const refresh = useCallback((): void => {
    window.api
      .listReviewItems()
      .then((next) => {
        setItems(next)
        setError(null)
        // 다음 목록이 오면 "옮겼어요" 알림은 낡는다 — 미루기 직후의 setMoved(true) 는 이 줄보다 늦게 돈다
        setMoved(false)
      })
      .catch((err: unknown) => setError(toUserError(err, getT().review.items.readFailed).text))
    window.api
      .listDismissedReviewItems()
      .then((next) => {
        setHidden(next)
        setHiddenError(null)
      })
      // 되돌리기 목록이다 — 못 읽어도 본 목록은 그대로 쓰고, 이전 되돌리기 목록도 지우지 않는다
      .catch(() => setHiddenError(getT().review.items.hiddenFailed))
  }, [])

  // 승인 구역은 숨긴 채 마운트돼 있다 — 구역에 들어올 때(점검·확정 뒤)와 볼트 전환 신호에 다시 읽는다.
  // 보고 있는 동안 페이지가 바뀌어도 다시 읽는다 — 그사이 생긴 페이지의 '빠진 페이지' 항목은 목록에서 빠진다
  const showing = view === 'knowledge' && section === 'review'
  useEffect(() => {
    if (showing) refresh()
  }, [showing, refresh, refreshKey])
  useEffect(
    () =>
      window.api.onWikiChanged((rels) => {
        if (rels.length === 0 || showing) refresh()
      }),
    [refresh, showing]
  )

  const dismiss = (id: string): void => {
    // 지운 자리 이웃을 기억해 둔다 — 목록이 다시 그려지면 그리로 초점을 옮긴다(body 낙하 방지)
    const at = items?.findIndex((item) => item.id === id) ?? -1
    const next = at >= 0 ? (items?.[at + 1] ?? items?.[at - 1] ?? null) : null
    focusNext.current = next ? `review-item-open:${next.id}` : 'review-items-heading'
    window.api
      .dismissReviewItem(id)
      .then(refresh)
      .then(() => setMoved(true))
      .catch((err: unknown) => {
        focusNext.current = null
        setError(toUserError(err, getT().review.items.dismissFailed).text)
      })
  }

  // 목록이 바뀌면 미뤄 둔 초점을 쓴다 — 실패하면 dismiss 가 이미 비웠다
  useEffect(() => {
    if (focusNext.current === null) return
    const target = focusNext.current
    focusNext.current = null
    const el = document.querySelector(`[data-testid="${target}"]`)
    if (el instanceof HTMLElement) el.focus()
  }, [items])

  const restore = (id: string): void => {
    window.api
      .restoreReviewItem(id)
      .then(refresh)
      .catch((err: unknown) => setError(toUserError(err, getT().review.items.restoreFailed).text))
  }

  // 항목이 없으면 옅은 머리글 한 줄로 접는다 — 빈 구역이 페이지 목록 위 ~130px 를 먹었다(2026-10-11).
  // 자리는 옮기지 않는다: 순서를 바꾸면 초점 순서와 보이는 순서가 어긋나고, 마지막 항목을 미룬 뒤 초점도 머리글에 남아야 한다
  const empty = items !== null && items.length === 0 && error === null
  return (
    <section data-testid="review-items" data-empty={empty} className="flex flex-col gap-2">
      {/* 다 미루면 여기가 마지막 기착지 — 탭으로 닿지 않아도 코드로 초점을 둘 수 있게 */}
      <h3
        className={empty ? 'text-caption text-muted-foreground' : 'text-heading'}
        tabIndex={-1}
        data-testid="review-items-heading"
      >
        {empty ? t.review.items.empty : t.review.items.title}
      </h3>
      {moved && (
        <p
          role="status"
          data-testid="review-items-moved"
          className="text-caption text-muted-foreground"
        >
          {t.review.items.moved}
        </p>
      )}
      {items === null && error === null && (
        <p
          role="status"
          data-testid="review-items-loading"
          className="text-caption text-muted-foreground"
        >
          {t.shell.reading}
        </p>
      )}
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline">
          {items.map((item) => (
            <li key={item.id} data-testid={`review-item:${item.id}`} className="px-4 py-2.5">
              <p className="text-callout">
                <span className="text-caption text-muted-foreground mr-1.5 rounded border border-hairline px-1">
                  {t.review.items.source[item.source]}
                </span>
                {item.title}
              </p>
              {item.detail && <p className="text-caption text-muted-foreground">{item.detail}</p>}
              {item.rel ? (
                <p className="text-caption text-muted-foreground">{folderLabel(item.rel)}</p>
              ) : (
                <p className="text-caption text-muted-foreground">{t.review.items.noDoc}</p>
              )}
              <div className="mt-1.5 flex gap-1.5">
                {/* 눌러도 안 되는 단추는 고장처럼 보인다 — 열 곳이 없으면 두지 않는다 */}
                {item.rel && (
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`review-item-open:${item.id}`}
                    onClick={() => {
                      openPeek(item.rel!)
                    }}
                  >
                    {t.review.items.open}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid={`review-item-dismiss:${item.id}`}
                  onClick={() => dismiss(item.id)}
                >
                  {t.review.items.later}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {hidden.length > 0 && (
        <details className="rounded-lg border border-hairline" data-testid="review-items-hidden">
          <summary className="focus-ring cursor-pointer rounded-lg px-4 py-2 text-caption text-muted-foreground">
            {t.review.items.hidden(hidden.length)}
            {hiddenError && (
              <span data-testid="review-items-hidden-stale">{t.review.items.stale}</span>
            )}
          </summary>
          <ul className="divide-y divide-hairline border-t border-hairline">
            {hidden.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 px-4 py-2"
                data-testid={`review-item-hidden:${item.id}`}
              >
                <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
                  {item.title}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  data-testid={`review-item-restore:${item.id}`}
                  onClick={() => restore(item.id)}
                >
                  {t.review.items.restore}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {hiddenError && hidden.length === 0 && (
        <p
          role="status"
          className="px-4 py-2 text-caption text-muted-foreground"
          data-testid="review-items-hidden-error"
        >
          {hiddenError}
        </p>
      )}
    </section>
  )
}
