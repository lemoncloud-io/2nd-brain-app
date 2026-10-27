import type { AppInfo } from '../shared/ipc-contract'

interface AppInfoSource {
  version: string
  platform: NodeJS.Platform
  electronVersion: string
}

export const buildAppInfo = (source: AppInfoSource): AppInfo => ({
  version: source.version,
  platform: source.platform,
  electronVersion: source.electronVersion
})
