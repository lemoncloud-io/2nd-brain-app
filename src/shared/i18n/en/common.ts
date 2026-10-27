import type { common as ko } from '../ko/common'

export const common: typeof ko = {
  saveSettingFailed: "Couldn't save this setting",
  noVault: 'No library is open',
  elapsed: (seconds: number): string =>
    seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`,
  passed: (time: string): string => `${time} elapsed`
}
