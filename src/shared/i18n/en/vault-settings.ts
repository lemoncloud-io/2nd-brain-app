import type { vaultSettings as ko } from '../ko/vault-settings'

export const vaultSettings: typeof ko = {
  title: 'Library',
  folder: {
    raw: 'originals',
    Clippings: 'waiting to wikify',
    wiki: 'wiki folder',
    'VAULT_RULES.md': 'library rules file'
  } as Record<string, string>,
  missingUnknown: "Can't tell what's missing. Open it again or create a new one",
  missing: (list: string): string => `Missing: ${list}`,
  namesMore: (shown: string, more: number): string => `${shown} and ${more} more`,
  restored: 'Library is back to its normal state',
  carried: (names: string): string => `Documents you edited in the app came along: ${names}`,
  awaitingBack: (names: string): string => `They show again once the team accepts them: ${names}`,
  statusFailed: "Couldn't read the library status",
  restoreFailed: "Couldn't restore it",
  none: "There isn't one yet. Create a new one",
  switch: 'Open another library',
  newWindow: 'Open in a new window',
  restore: 'Restore library state',
  switchHint:
    'Open another library — stops any wiki draft or chat in progress and switches to the library you pick',
  newWindowHint:
    'Open in a new window — keeps this window as it is and opens the library you pick in a separate window',
  restoreHint:
    'Restore library state — brings a library left mid-task back to its normal state · documents you edited in the app come along · if some documents would be hidden for a while it asks first, and if a wiki draft is waiting for approval it does nothing',
  recents: 'Recent libraries',
  generic:
    'This folder is open for reading. You can read it in the tree and reader, but wiki drafts, checks and team sync are not available.',
  adoptGeneric: 'Use this folder as my library',
  confirm:
    "Some documents are still being reviewed by your team. If you restore, they won't show in the app until the team accepts them. They aren't deleted.",
  awaiting: (names: string): string => `Hidden for a while: ${names}`,
  carry: (names: string): string => `Documents you edited in the app come along: ${names}`,
  restoreAnyway: 'Restore anyway',
  keep: 'Keep',
  invalid: "This folder doesn't have what the wiki needs",
  reopen: 'Open again'
}
