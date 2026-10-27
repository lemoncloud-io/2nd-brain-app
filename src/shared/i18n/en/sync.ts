import type { sync as ko } from '../ko/sync'

const changes = (n: number): string => (n === 1 ? '1 change' : `${n} changes`)

export const sync: typeof ko = {
  ahead: (n: number): string => ` · ${n} not uploaded yet`,
  running: 'Getting team changes…',
  signedOut: (ahead: string): string => `Reconnect GitHub${ahead}`,
  conflicts: (n: number, ahead: string): string =>
    `${n === 1 ? '1 page' : `${n} pages`} edited by both you and the team${ahead}`,
  behindReviewPending: (n: number, ahead: string): string =>
    `${changes(n)} from the team — you'll get them after you finish reviewing${ahead}`,
  behind: (n: number, ahead: string): string =>
    `${changes(n)} from the team · your work stays as it is${ahead}`,
  never: (ahead: string): string => `Get team changes${ahead}`,
  noRemote: 'Not connected to a team repository — connect one under Team repository in Settings',
  noRemoteHeld:
    "Not connected to a team repository, so you're still on your last work — connect one under Team repository in Settings",
  reviewPending: (ahead: string): string => `Didn't get changes — waiting for your review${ahead}`,
  busy: (ahead: string): string =>
    `Didn't get changes — a wiki draft or adding to the wiki is in progress · will try again when it's done${ahead}`,
  stuck:
    'Didn\'t get changes because the library was left mid-task — click "Reset library state" in Settings, and if that doesn\'t help, ask a teammate who manages this library',
  switchBlocked:
    "Your earlier work reached the team, but couldn't move to the team's latest version — check whether a file you created has the same name as a team page, and if so, move or delete it, then get changes again",
  held: (ahead: string): string => `The team's latest version is downloaded${ahead}`,
  receivedMerge: (n: number): string => `Got ${changes(n)} by merging`,
  received: (n: number): string => `Got ${changes(n)}`,
  nothingNew: 'No new team changes',
  aheadFiles: (shown: string, rest: number): string =>
    `Files to upload: ${shown}${rest > 0 ? ` and ${rest} more` : ''}`,
  conflict: {
    title: 'You and your team edited the same document separately',
    explain:
      "— choose which version to keep. The other one isn't lost: it stays in the same folder with the date added.",
    more: (n: number): string => ` This is the first of ${n} documents to choose for.`,
    team: "Your team's version",
    mine: 'Your version',
    deleted: 'This document was deleted. Keeping this version removes the document',
    keep: 'Keep this version',
    readFailed: "Couldn't read the two versions",
    saveFailed: "Couldn't save your choice"
  }
}
