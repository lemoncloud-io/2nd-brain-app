// 편집기 아래 줄 — 글 분량(Obsidian Word count). 편집기 본체와 따로 그린다: 세기는 글 길이에 비례해서
// 본체에서 세면 입력마다 편집기 전체가 한 번 더 그려진다.
import { memo, useDeferredValue, useMemo } from 'react'
import { countText } from '../../../../shared/wiki/text-count'
import { countLabel } from '../../lib/count-label'
import { useT } from '../../lib/i18n'

export const EditorCount = memo(function EditorCount({
  text,
  selected
}: {
  text: string
  /** 고른 글 — 있으면 그 분량을 센다 */
  selected: string
}): React.JSX.Element {
  // 입력이 몰리면 세기를 미룬다 — 긴 글에서 입력이 밀리지 않는다. 언어(t)가 바뀌면 다시 센다
  const t = useT()
  const deferredText = useDeferredValue(text)
  const deferredSelected = useDeferredValue(selected)
  const whole = useMemo(() => countLabel(countText(deferredText)), [deferredText, t])
  const part = useMemo(
    () => (deferredSelected === '' ? null : countLabel(countText(deferredSelected))),
    [deferredSelected, t]
  )
  return (
    <p
      data-testid="wiki-editor-count"
      className="shrink-0 border-t border-hairline px-6 py-1 text-right text-caption text-muted-foreground tabular-nums"
      title={t.wikiDoc.editor.countHint}
    >
      {part === null ? whole : t.wikiDoc.editor.countSelected(part)}
    </p>
  )
})
