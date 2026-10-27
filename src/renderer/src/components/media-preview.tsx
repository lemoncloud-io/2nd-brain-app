// 소리·영상 미리보기 — 바이트는 vault:// 가 Range 로 흘려보낸다(큰 영상도 탐색된다).
// 코덱은 기기마다 다르다(.mkv·.mov 가 특히) — 못 재생하면 Obsidian 으로 가는 길을 준다.
import { useState } from 'react'
import { OpenElsewhere } from './open-elsewhere'
import { vaultUrl } from '../../../shared/vault-file-types'
import { useT } from '../lib/i18n'

/**
 * 리더 안 임베드는 자리를 적게 쓴다 — 미리보기 화면은 크게.
 * 부르는 쪽은 `key={rel}` 로 준다(PdfPreview 와 같은 선례) — 파일이 바뀌면 재생 실패 상태도 새로 시작한다.
 */
export const MediaPreview = ({
  rel,
  kind,
  compact = false
}: {
  rel: string
  kind: 'audio' | 'video'
  compact?: boolean
}): React.JSX.Element => {
  const t = useT()
  const [failed, setFailed] = useState(false)
  const src = vaultUrl(rel)

  if (failed) {
    return (
      <div className="flex flex-col items-start gap-2 py-2" data-testid="sources-media-error">
        <p className="text-caption text-muted-foreground">{t.shell.mediaUnplayable}</p>
        <OpenElsewhere rel={rel} />
      </div>
    )
  }

  if (kind === 'audio') {
    return (
      <audio
        controls
        src={src}
        aria-label={rel}
        className={compact ? 'my-2 w-full max-w-[28rem]' : 'w-full max-w-[32rem]'}
        onError={() => setFailed(true)}
        data-testid="sources-audio"
      />
    )
  }

  return (
    <video
      controls
      src={src}
      aria-label={rel}
      className={
        compact ? 'my-2 max-h-80 w-full max-w-[32rem] rounded-md' : 'max-h-full max-w-full'
      }
      onError={() => setFailed(true)}
      data-testid="sources-video"
    />
  )
}
