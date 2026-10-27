import type { sources as ko } from '../ko/sources'

export const sources: typeof ko = {
  title: 'Add sources',
  intro:
    'Add the sources you want to turn into wiki pages (files or web page addresses). The AI reads them and drafts wiki pages, and only what you choose in Approvals goes into the wiki.',
  waitingTitle: 'Sources waiting for a wiki draft',
  goIngest: 'Go make a wiki draft',
  waitingEmpty: 'No sources are waiting. Add a file or web page address above and it gathers here',
  backToAdd: 'Back up to Add sources',
  clip: {
    types: 'Notes, text, PDF, HWP and Office documents',
    failed: "Couldn't add it",
    dropLabel: 'Add a file — press Enter to choose a file',
    adding: 'Adding…',
    drop: 'Drag files here',
    keyboard: 'With a keyboard, Tab here and press Enter',
    pick: 'Choose files',
    urlLabel: 'Web page address',
    urlPlaceholder: 'Web page address https://…',
    fetching: 'Fetching…',
    fetch: 'Fetch',
    urlHint: 'Enter an address to turn on Fetch — pressing Enter works too',
    added: (name: string): string => `Added to sources: ${name}`,
    clearResults: 'Clear results'
  },
  ingest: {
    succeeded: 'Wiki draft finished. Read the pages in Approvals and put them in the wiki',
    syncNeeded: (reason: string): string =>
      `${reason} Your team's changes may not have come in. Starting without syncing may write over an old copy of the library.`,
    startFailed: "Couldn't start making the wiki draft",
    running: (elapsed: string): string => `Making the wiki draft · ${elapsed} so far`,
    cancelFailed: "Couldn't send the stop request",
    canceling: 'Stopping…',
    cancel: 'Stop',
    pressAgain: ' — press it again',
    toReview: 'Go to Approvals',
    withoutSync: 'Start without syncing',
    retrySync: 'Get changes again',
    retry: 'Try again',
    explain: (n: number | null): string =>
      `The AI reads ${n === null ? 'the sources you added' : `the ${n} ${n === 1 ? 'source' : 'sources'} you added`} and drafts wiki pages. It takes a few minutes and uses your subscription. Only the drafts you choose in Approvals go into the wiki.`,
    start: (n: number | null): string =>
      n === null
        ? 'Make a wiki draft'
        : `Make a wiki draft from ${n} ${n === 1 ? 'source' : 'sources'}`,
    progress: (total: number, done: number, pages: number): string =>
      `${done} of ${total} ${total === 1 ? 'source' : 'sources'} drafted · ${pages} page ${pages === 1 ? 'draft' : 'drafts'}`,
    waiting: 'Waiting sources',
    raw: 'Details — show this when asking for help',
    emptyTitle: 'No sources to draft',
    emptyBody:
      'Add some writing, documents or web pages first. You can also drag files into the chat. The AI reads what you add and makes wiki pages'
  }
}
