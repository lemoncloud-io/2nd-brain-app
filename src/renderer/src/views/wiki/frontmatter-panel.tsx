// 제목 아래 속성 줄 — 읽고 그 자리에서 고친다(Obsidian 속성 칸). 값을 누르면 칸이 열리고 Enter 로 저장,
// 저장은 편집과 같은 `edit: <slug>` 커밋이다. 목록 키(tags·aliases…)는 쉼표로 쓴다. 중첩 값은 원문 편집으로만.
import { useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { WikiPage } from '../../../../shared/wiki/parse'
import {
  LIST_KEYS,
  editableValue,
  inputFromValue,
  valueFromInput,
  type PropertyValue
} from '../../../../shared/wiki/properties'
import { useT } from '../../lib/i18n'

// 페이지 맨 위 속성은 영문 키로 저장된다 — 아는 키는 사전(wikiPanes.props.labels)의 이름으로 바꿔 보여 준다.
// 사전에 없는 키는 접은 칸에 원래 이름 그대로 남는다.

/** 속성 하나를 바꾼다(null = 지우기). 실패하면 사유를 돌려준다 */
export type SetProperty = (key: string, value: PropertyValue | null) => Promise<string | null>

const EditBox = ({
  initial,
  label,
  testId,
  onCommit,
  onCancel
}: {
  initial: string
  label: string
  testId: string
  onCommit: (text: string) => void
  onCancel: () => void
}): React.JSX.Element => {
  // Enter 뒤 칸이 사라지며 blur 가 한 번 더 올 수 있다 — 한 번만 끝낸다
  const done = useRef(false)
  const finish = (run: () => void): void => {
    if (done.current) return
    done.current = true
    run()
  }
  return (
    <input
      autoFocus
      aria-label={label}
      data-testid={testId}
      defaultValue={initial}
      spellCheck={false}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        const value = e.currentTarget.value
        if (e.key === 'Enter') {
          e.preventDefault()
          finish(() => onCommit(value))
        }
        if (e.key === 'Escape') {
          e.stopPropagation()
          finish(onCancel)
        }
      }}
      onBlur={(e) => {
        const value = e.currentTarget.value
        finish(() => onCommit(value))
      }}
      className="min-h-6 min-w-24 rounded-sm border border-ring bg-background px-1 text-label text-foreground outline-none"
    />
  )
}

const Row = ({
  name,
  label,
  value,
  onSet
}: {
  name: string
  label: string
  value: unknown
  onSet?: SetProperty
}): React.JSX.Element => {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const canEdit = onSet !== undefined && editableValue(name, value)
  const commit = (text: string): void => {
    setEditing(false)
    if (text === inputFromValue(value)) return
    void onSet?.(name, valueFromInput(name, text))
  }
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="shrink-0 text-muted-foreground" title={name}>
        {label}
      </dt>
      <dd className="min-w-0 break-words text-label">
        {editing ? (
          <EditBox
            initial={inputFromValue(value)}
            label={t.wikiPanes.props.value(label)}
            testId={`prop-input:${name}`}
            onCommit={commit}
            onCancel={() => setEditing(false)}
          />
        ) : canEdit ? (
          <button
            type="button"
            data-testid={`prop-value:${name}`}
            title={
              LIST_KEYS.has(name) ? t.wikiPanes.props.editListHint : t.wikiPanes.props.editHint
            }
            onClick={() => setEditing(true)}
            className="focus-ring inline-flex min-h-6 items-center rounded-sm px-0.5 text-left hover:bg-accent"
          >
            {inputFromValue(value) || (
              <span className="text-muted-foreground">{t.wikiPanes.props.empty}</span>
            )}
          </button>
        ) : (
          <span data-testid={`prop-value:${name}`}>{inputFromValue(value)}</span>
        )}
        {/* `dl` 안 묶음에는 dt·dd 만 둘 수 있다 — 지우기 단추도 값 칸 안에 둔다.
          누를 자리는 24px, 줄 높이는 그대로(음수 여백). 마우스를 올리지 않아도 흐리게 보인다 */}
        {canEdit && !editing && (
          <button
            type="button"
            aria-label={t.wikiPanes.props.remove(label)}
            data-testid={`prop-remove:${name}`}
            onClick={() => void onSet?.(name, null)}
            className="focus-ring -my-1.5 ml-0.5 inline-flex size-6 items-center justify-center rounded-sm align-middle text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden className="size-3" />
          </button>
        )}
      </dd>
    </div>
  )
}

/** 새 속성 — 이름과 값을 받아 한 번에 저장한다 */
const AddProperty = ({ onSet }: { onSet: SetProperty }): React.JSX.Element => {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const close = (): void => {
    setOpen(false)
    setKey('')
    setValue('')
    setError(null)
  }
  const save = (): void => {
    const name = key.trim()
    if (name === '') {
      close()
      return
    }
    void onSet(name, valueFromInput(name, value)).then((failed) => {
      if (failed) setError(failed)
      else close()
    })
  }
  if (!open) {
    return (
      <button
        type="button"
        data-testid="prop-add"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex min-h-6 items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground"
      >
        <Plus aria-hidden className="size-3" /> {t.wikiPanes.props.add}
      </button>
    )
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      save()
    }
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        autoFocus
        aria-label={t.wikiPanes.props.newKey}
        placeholder={t.wikiPanes.props.newKeyPlaceholder}
        data-testid="prop-new-key"
        value={key}
        spellCheck={false}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={onKeyDown}
        className="min-h-6 w-32 rounded-sm border border-hairline bg-background px-1 text-label outline-none focus:border-ring"
      />
      <input
        aria-label={t.wikiPanes.props.newValue}
        placeholder={t.wikiPanes.props.newValuePlaceholder}
        data-testid="prop-new-value"
        value={value}
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        className="min-h-6 w-48 rounded-sm border border-hairline bg-background px-1 text-label outline-none focus:border-ring"
      />
      {error && (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}

// 빈 값(null·빈 문자열)은 보이지 않는다
export const FrontmatterPanel = ({
  page,
  onSet
}: {
  page: WikiPage
  /** 없으면 읽기 전용(미리보기·잠금) */
  onSet?: SetProperty
}): React.JSX.Element | null => {
  const t = useT()
  if (page.frontmatterError) {
    return (
      <p
        data-testid="wiki-frontmatter"
        title={page.frontmatterError}
        className="mt-3 text-caption text-destructive"
      >
        {t.wikiPanes.props.unreadable}
      </p>
    )
  }
  const entries = Object.entries(page.frontmatter ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  )
  if (entries.length === 0 && onSet === undefined) return null
  const labels = t.wikiPanes.props.labels
  const known = entries.filter(([key]) => key in labels)
  const rest = entries.filter(([key]) => !(key in labels))
  return (
    <div
      data-testid="wiki-frontmatter"
      // 속성이 없는 문서는 "속성 추가" 한 줄만 — 빈 칸에 선을 긋지 않는다
      className={`mt-4 text-caption ${entries.length > 0 ? 'border-b border-hairline pb-5' : ''}`}
      data-frontmatter-keys={entries.length}
    >
      {known.length > 0 && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1.5">
          {known.map(([key, value]) => (
            <Row key={key} name={key} label={labels[key]} value={value} onSet={onSet} />
          ))}
        </dl>
      )}
      {rest.length > 0 && (
        <details className="mt-1.5">
          <summary className="focus-ring cursor-pointer rounded-sm text-muted-foreground">
            {t.wikiPanes.props.rest(rest.length)}
          </summary>
          <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1.5">
            {rest.map(([key, value]) => (
              <Row key={key} name={key} label={key} value={value} onSet={onSet} />
            ))}
          </dl>
        </details>
      )}
      {onSet && (
        <div className={entries.length > 0 ? 'mt-1.5' : ''}>
          <AddProperty onSet={onSet} />
        </div>
      )}
    </div>
  )
}
