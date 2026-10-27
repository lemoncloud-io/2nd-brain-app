// 문서 기록에서 고른 버전 — 리더 자리에 그 버전과 지금 글의 바뀐 줄을 보이고, 그 버전으로 되돌린다.
// 되돌리기는 그 버전의 글을 편집 저장과 같은 길(`writeWikiPage`)로 저장한다: `edit:` 커밋 하나,
// 기준은 버전을 고른 때의 글이다 — 보는 사이 문서가 바뀌면(받기·AI 가 씀) 비교가 저절로 바뀌지 않고
// 되돌리기를 막은 채 다시 견주기를 권한다. 저장 쪽도 그때 해시로 확인하고, 승인을 기다리는 위키화가 있으면 거절한다.
import { useEffect, useMemo, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import type { DocVersion } from '../../../../shared/ipc-contract'
import { lineHunks } from '../../../../shared/line-diff'
import { Button } from '../../components/ui/button'
import { ErrorNote } from '../../components/error-note'
import { versionWhen, versionWho } from '../../lib/doc-version'
import { toUserError, type UserError } from '../../lib/user-error'
import { getT, useT } from '../../lib/i18n'

/**
 * 비교 전용(md 가 아닌 글자 파일)의 줄 비교 상한(글자 수) — 넘는 글은 견주지 않고 그렇다고 말한다.
 * 큰 기록·표 파일이 화면을 세우지 않게. md 는 걸지 않는다: 무엇이 바뀌는지 못 본 채 되돌리게 두지 않는다
 */
export const DIFF_TEXT_LIMIT = 400_000

export const HistoryDiff = ({
  rel,
  version,
  current,
  hash,
  onClose,
  onRestored
}: {
  rel: string
  version: DocVersion
  /** 지금 리더가 그리는 글과 그 해시 — 처음 받은 것을 기준으로 붙잡는다 */
  current: string
  hash?: string
  onClose: () => void
  /**
   * 되돌린 뒤 — 되돌리기 전 글과 저장된 글의 해시(실행 취소가 그 둘로 다시 저장한다).
   * 없으면 비교 전용이다(md 가 아닌 글자 파일 — 쓰는 길이 md 전용이다): 되돌리기 단추가 없고 지금 글을 그대로 따라 견준다
   */
  onRestored?: (undo: { text: string; hash: string }) => void
}): React.JSX.Element => {
  const t = useT()
  const compareOnly = onRestored === undefined
  const [loaded, setLoaded] = useState<{
    rev: string
    text: string | null
    error: UserError | null
  } | null>(null)
  const [base, setBase] = useState(() => ({ text: current, hash: hash ?? '' }))
  const moved = !compareOnly && hash !== base.hash
  const against = compareOnly ? current : base.text
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<UserError | null>(null)

  useEffect(() => {
    let stale = false
    window.api
      .docAt(rel, version.rev)
      .then((result) => {
        if ('error' in result) throw result.error
        if (!stale) setLoaded({ rev: version.rev, text: result.text, error: null })
      })
      .catch((error: unknown) => {
        console.error('could not get the document version', error)
        if (!stale) {
          setLoaded({
            rev: version.rev,
            text: null,
            error: toUserError(error, getT().wikiPanes.diff.readFailed)
          })
        }
      })
    return () => {
      stale = true
    }
  }, [rel, version.rev])

  const shown = loaded?.rev === version.rev ? loaded : null
  const old = shown?.text ?? null
  const tooLarge =
    compareOnly &&
    old !== null &&
    (old.length > DIFF_TEXT_LIMIT || against.length > DIFF_TEXT_LIMIT)
  const hunks = useMemo(
    () => (old === null || tooLarge ? null : lineHunks(old, against)),
    [old, against, tooLarge]
  )
  const same = hunks?.length === 0
  const canRestore = old !== null && !restoring && !moved

  const restore = (): void => {
    if (old === null || onRestored === undefined) return
    setRestoring(true)
    setRestoreError(null)
    void window.api
      .writeWikiPage(rel, old, base.hash)
      .then((result) => {
        if ('error' in result)
          setRestoreError(toUserError(result.error, getT().wikiPanes.diff.restoreFailed))
        else onRestored({ text: base.text, hash: result.hash })
      })
      .catch((error: unknown) => {
        console.error('restore failed', rel, error)
        setRestoreError(toUserError(error, getT().wikiPanes.diff.restoreFailed))
      })
      .finally(() => setRestoring(false))
  }

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto" data-testid="history-diff">
      <div className="mx-auto max-w-[42rem] px-8 pt-10 pb-24">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-heading">
              {versionWho(version)} · {versionWhen(version)}
            </h2>
            {same ? (
              <p className="mt-1 text-caption text-muted-foreground" data-testid="history-same">
                {t.wikiPanes.diff.same}
              </p>
            ) : tooLarge ? null : (
              <p className="mt-1 text-caption text-muted-foreground">{t.wikiPanes.diff.differs}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {/* 같은 버전이면 되돌릴 것이 없다 — 누를 수 없는 단추를 세워 두지 않는다.
                기다리는 동안(읽는 중·문서가 바뀜)은 채운 단추 대신 테두리 단추로 눌리지 않는 티를 낸다 */}
            {!same && !compareOnly && (
              <Button
                size="sm"
                variant={canRestore ? 'default' : 'outline'}
                data-testid="history-restore"
                disabled={!canRestore}
                onClick={restore}
              >
                <RotateCcw aria-hidden />{' '}
                {restoring ? t.wikiPanes.diff.restoring : t.wikiPanes.diff.restore}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              data-testid="history-close"
              aria-label={t.wikiPanes.diff.close}
              title={t.wikiPanes.diff.closeHint}
              onClick={onClose}
            >
              <X aria-hidden />
            </Button>
          </div>
        </div>
        {moved && (
          <div
            role="status"
            data-testid="history-moved"
            className="mt-3 flex items-center justify-between gap-3 rounded-md bg-accent px-3 py-2 text-caption"
          >
            <span>{t.wikiPanes.diff.moved}</span>
            <Button
              size="sm"
              variant="outline"
              data-testid="history-rebase"
              onClick={() => {
                setRestoreError(null)
                setBase({ text: current, hash: hash ?? '' })
              }}
            >
              {t.wikiPanes.diff.rebase}
            </Button>
          </div>
        )}
        {restoreError && (
          <ErrorNote error={restoreError} testId="history-restore-error" className="mt-3" />
        )}

        <div className="mt-6">
          {shown === null ? (
            <p role="status" className="text-caption text-muted-foreground">
              {t.preview.loading}
            </p>
          ) : shown.error ? (
            <ErrorNote error={shown.error} testId="history-diff-error" />
          ) : tooLarge ? (
            <p className="text-caption text-muted-foreground" data-testid="history-too-large">
              {t.wikiPanes.diff.tooLarge}
            </p>
          ) : same ? null : (
            // 바뀐 자리마다 예전 글 → 지금 글 순서로, 줄 번호·± 기호 대신 말로 가른다
            <div className="flex flex-col gap-3">
              {hunks?.map((hunk) => (
                <div
                  key={`${hunk.oldStart}:${hunk.start}`}
                  data-testid="history-hunk"
                  className="overflow-hidden rounded-md border border-hairline text-caption"
                >
                  <HunkSide
                    label={t.wikiPanes.diff.before}
                    lines={hunk.removed}
                    tone="bg-destructive/10"
                  />
                  <HunkSide label={t.wikiPanes.diff.after} lines={hunk.added} tone="bg-added/10" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** 바뀐 자리의 한쪽 — 그쪽에만 있는 줄. 없으면(줄을 더하기만·빼기만 했으면) 그리지 않는다 */
const HunkSide = ({
  label,
  lines,
  tone
}: {
  label: string
  lines: string[]
  tone: string
}): React.JSX.Element | null =>
  lines.length === 0 ? null : (
    <div className={tone}>
      <p className="px-3 pt-1.5 text-micro text-muted-foreground">{label}</p>
      {lines.map((line, at) => (
        <p key={at} className="px-3 py-0.5 font-mono whitespace-pre-wrap wrap-anywhere">
          <span className="sr-only">{label}: </span>
          {line}
        </p>
      ))}
      <div className="h-1" aria-hidden />
    </div>
  )
