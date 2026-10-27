import type { update as ko } from '../ko/update'

export const update: typeof ko = {
  now: (current: string | null): string => (current ? `Version ${current}` : 'Current version'),
  off: (now: string): string => `${now} · Your team sends new versions`,
  latest: (now: string): string => `${now} · Up to date`,
  checking: (now: string): string => `${now} · Checking for a new version…`,
  downloading: (version: string, percent: number): string =>
    `Downloading version ${version} · ${percent}%`,
  ready: (version: string): string => `Version ${version} is ready · Restart to update`,
  installFailed: (now: string): string =>
    `${now} · Couldn't switch to the new version — click Restart once more`,
  checkFailed: (now: string): string => `${now} · Couldn't check for a new version`
}
