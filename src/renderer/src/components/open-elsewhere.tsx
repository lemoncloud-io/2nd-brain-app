// 앱이 못 여는 파일의 막다른 길을 막는다 — Obsidian·파일 탐색기로 가는 길.
// 미리보기 폴백과 재생 실패 안내가 같은 버튼을 쓴다.
import { FolderSearch } from 'lucide-react'
import { Button } from './ui/button'
import { fileManagerName, usePlatform } from '../hooks/use-platform'
import { useT } from '../lib/i18n'

export const OpenElsewhere = ({ rel }: { rel: string }): React.JSX.Element => {
  const t = useT()
  const platform = usePlatform()
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        data-testid="sources-open-obsidian"
        onClick={() => void window.api.openInObsidian(rel)}
      >
        {t.shell.openInObsidian}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => void window.api.revealInFinder(rel)}>
        {t.shell.revealIn(fileManagerName(platform))}
      </Button>
    </div>
  )
}

/**
 * 머리줄용 파일 탐색기 단추 — 미리보기 종류와 무관하게 같은 자리다.
 * 미리보기 머리(그림·글·PDF…)와 리더 머리가 같이 쓴다.
 */
export const RevealButton = ({
  rel,
  testId
}: {
  rel: string
  testId: string
}): React.JSX.Element => {
  const t = useT()
  const platform = usePlatform()
  const label = t.shell.revealIn(fileManagerName(platform))
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={() => void window.api.revealInFinder(rel)}
    >
      <FolderSearch aria-hidden />
    </Button>
  )
}
