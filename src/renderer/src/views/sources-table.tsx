// csv·tsv 미리보기 — 첫 줄을 머리로 한 표. 버튼 하나로 원문과 오간다.
// 큰 파일은 앞 MAX_ROWS 줄만 그린다 — 수만 줄을 DOM 으로 만들면 칸이 멈춘다.
import { useMemo, useState } from 'react'
import { Button } from '../components/ui/button'
import { ErrorNote } from '../components/error-note'
import { useVaultText } from '../lib/use-vault-text'
import { parseDelimited } from '../lib/delimited'
import { useT } from '../lib/i18n'

const MAX_ROWS = 1000

export const TablePreview = ({ rel, sep }: { rel: string; sep: ',' | '\t' }): React.JSX.Element => {
  const t = useT()
  const { text, error } = useVaultText(rel)
  const [source, setSource] = useState(false)
  const rows = useMemo(() => (text === null ? null : parseDelimited(text, sep)), [text, sep])

  if (error) return <ErrorNote error={error} className="p-4" />
  if (text === null || rows === null)
    return (
      <p role="status" className="p-4 text-caption text-muted-foreground">
        {t.preview.loading}
      </p>
    )

  const [head = [], ...body] = rows
  const width = Math.max(0, ...rows.map((row) => row.length))
  const shown = body.slice(0, MAX_ROWS)
  const pad = (row: string[]): string[] =>
    row.length < width ? [...row, ...Array<string>(width - row.length).fill('')] : row

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2">
        <p
          className="text-caption text-muted-foreground tabular-nums"
          data-testid="sources-table-size"
        >
          {source
            ? t.sourceView.source
            : body.length > MAX_ROWS
              ? t.sourceView.table.rowsCut(body.length, MAX_ROWS, width)
              : t.sourceView.table.rows(body.length, width)}
        </p>
        <Button
          variant="ghost"
          size="sm"
          data-testid="sources-table-toggle"
          onClick={() => setSource((on) => !on)}
        >
          {source ? t.sourceView.table.asTable : t.sourceView.showSource}
        </Button>
      </div>
      {source ? (
        <pre className="px-6 py-4 font-mono text-callout whitespace-pre-wrap select-text">
          {text}
        </pre>
      ) : (
        <table
          data-testid="sources-table"
          className="w-max min-w-full border-collapse text-caption select-text"
        >
          <thead className="sticky top-0 bg-background">
            <tr>
              {pad(head).map((cell, i) => (
                <th
                  key={i}
                  scope="col"
                  className="max-w-96 border-b border-r border-hairline px-3 py-1.5 text-left font-medium whitespace-pre-wrap last:border-r-0"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => (
              <tr key={r} className="even:bg-muted/40">
                {pad(row).map((cell, i) => (
                  <td
                    key={i}
                    className="max-w-96 border-r border-hairline px-3 py-1 align-top whitespace-pre-wrap tabular-nums last:border-r-0"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
