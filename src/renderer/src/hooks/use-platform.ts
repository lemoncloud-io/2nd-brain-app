// 운영체제 — 설치 명령과 파일 탐색기 이름이 이것으로 갈린다.
// 아직 모르면 null 이다: 모르는 채로 macOS 라고 말하면 Windows 사용자가 없는 앱을 찾는다.
import { useEffect, useState } from 'react'
import { getT } from '../lib/i18n'

export const usePlatform = (): NodeJS.Platform | null => {
  const [platform, setPlatform] = useState<NodeJS.Platform | null>(null)
  useEffect(() => {
    window.api
      .getAppInfo()
      .then((info) => setPlatform(info.platform))
      .catch(() => setPlatform(null))
  }, [])
  return platform
}

/** OS 가 파일을 보여 주는 앱 이름 — 모르면 중립적으로 말한다 */
export const fileManagerName = (platform: NodeJS.Platform | null): string =>
  platform === 'win32'
    ? getT().shell.fileExplorer
    : platform === 'darwin'
      ? 'Finder'
      : getT().shell.fileManager
