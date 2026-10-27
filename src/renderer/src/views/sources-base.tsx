// `.base`(Obsidian Bases) 미리보기 — 뷰마다 탭, 그 아래 표. 읽기 전용이다.
// 이 표는 앱이 보관함 md 의 frontmatter 로 다시 계산한 것이다. 정본은 Obsidian 이라
// 머리줄에 늘 "Obsidian 에서 열기" 를 둔다 — 계산이 어긋나도 원본으로 갈 길이 한 번에 있다.
import { Fragment, useEffect, useState } from 'react'
import type { BaseTable } from '../../../shared/bases/evaluate'
import { OpenElsewhere } from '../components/open-elsewhere'
import { ErrorNote } from '../components/error-note'
import { toUserError, type UserError } from '../lib/user-error'
import { useWorkbench } from '../store/workbench'
import { cn } from '../lib/utils'
import { getT, useT } from '../lib/i18n'

export const BasePreview = ({ rel }: { rel: string }): React.JSX.Element => {
  const t = useT()
  const [table, setTable] = useState<BaseTable | null>(null)
  const [error, setError] = useState<UserError | null>(null)
  const [at, setAt] = useState(0)
  const openFile = useWorkbench((s) => s.openFile)

  // 부르는 쪽이 `key={rel}` 로 준다 — 파일이 바뀌면 통째로 새로 시작한다(빈 표를 지울 필요가 없다)
  useEffect(() => {
    let cancelled = false
    void window.api
      .readBase(rel)
      .then((result) => {
        if (!cancelled) setTable(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toUserError(err, getT().sourceView.base.failed))
      })
    return () => {
      cancelled = true
    }
  }, [rel])

  if (error) return <ErrorNote error={error} className="p-4" />
  if (table === null)
    return <p className="p-4 text-caption text-muted-foreground">{t.preview.loading}</p>

  const view = table.views[at]

  return (
    <div className="flex min-h-0 flex-col" data-testid="sources-base">
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-2">
        {table.views.map((one, index) => (
          <button
            key={`${one.name}:${index}`}
            type="button"
            data-testid="base-view-tab"
            aria-selected={index === at}
            onClick={() => setAt(index)}
            className={cn(
              'focus-ring rounded-sm px-2 py-0.5 text-callout',
              index === at ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-label'
            )}
          >
            {one.name}
          </button>
        ))}
        <span className="flex-1" />
        <OpenElsewhere rel={rel} />
      </div>

      {table.error && <p className="px-4 py-3 text-callout text-muted-foreground">{table.error}</p>}
      {table.truncated && (
        <p className="px-4 py-2 text-caption text-muted-foreground" data-testid="base-truncated">
          {t.sourceView.base.truncated(table.truncated.total, table.truncated.seen)}
        </p>
      )}

      {view && view.unsupported !== undefined && (
        <p className="px-4 py-3 text-callout text-muted-foreground" data-testid="base-unsupported">
          {view.unsupported}
        </p>
      )}

      {view && view.unsupported === undefined && (
        <div className="scrollbar-thin min-h-0 overflow-auto">
          <p className="px-4 pt-3 text-caption text-muted-foreground" data-testid="base-count">
            {t.sourceView.base.count(view.rows.length)}
          </p>
          <table className="w-full border-collapse text-callout" data-testid="base-table">
            <thead>
              <tr className="border-b border-hairline text-left">
                {view.columns.map((column) => (
                  <th key={column.key} className="px-4 py-2 font-normal text-muted-foreground">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row, at) => (
                <Fragment key={`${row.rel}:${at}`}>
                  {row.group !== undefined && row.group !== view.rows[at - 1]?.group && (
                    <tr className="border-b border-hairline">
                      <th
                        colSpan={view.columns.length}
                        scope="colgroup"
                        data-testid="base-group"
                        className="bg-accent/40 px-4 py-1 text-left text-caption font-normal text-muted-foreground"
                      >
                        {row.group === '' ? t.sourceView.base.noGroup : row.group}
                      </th>
                    </tr>
                  )}
                  <tr className="border-b border-hairline last:border-0">
                    {row.cells.map(({ text, rel: target }, index) => (
                      <td
                        key={`${view.columns[index]?.key ?? ''}:${index}`}
                        className="px-4 py-2 align-top"
                      >
                        {target === undefined ? (
                          <span className="wrap-anywhere">{text}</span>
                        ) : (
                          <button
                            type="button"
                            className="focus-ring rounded-sm text-left text-primary-ink hover:underline"
                            data-testid="base-row-open"
                            title={target}
                            onClick={() => openFile(target)}
                          >
                            {text}
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
          {view.rows.length === 0 && (
            <p className="px-4 py-3 text-callout text-muted-foreground">
              {t.sourceView.base.empty}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
