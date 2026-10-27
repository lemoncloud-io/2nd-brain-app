import type { review as ko } from '../ko/review'

export const review: typeof ko = {
  undoWindow: 'You can undo this until you make another edit or wiki draft',
  approveUpload:
    'When you approve, that batch is uploaded to GitHub. In a repository only you use, it goes straight in; in a shared one, it becomes a team review request.',
  teamReview:
    "It goes into your wiki right away, and the pages and added sources are uploaded to GitHub. In a repository only you use, it's uploaded right away and can't be undone afterwards. In a shared one, it becomes a team review request (the team approves on GitHub), and undoing also closes the request",
  published: "Uploaded to GitHub · it can't be undone after uploading",
  republishing: 'Uploading to GitHub…',
  publishFailedHead: "Couldn't upload to GitHub",
  publishFailed: (reason: string): string =>
    `It's in your wiki, but couldn't be uploaded to GitHub yet — ${reason || 'upload it again'}`,
  readCount: (read: number, total: number): string => `Read ${read} of ${total}`,
  status: { added: 'New page', modified: 'Edited page' },
  change: {
    A: 'New file',
    M: 'Edited file',
    D: 'Deleted file',
    R: 'Renamed file',
    C: 'Copied file'
  } as Record<string, string>,
  verifyFailed: (n: number): string =>
    `Not added to the wiki. The check before adding found ${n} ${n === 1 ? 'problem' : 'problems'}. Fix ${n === 1 ? 'it' : 'them'} or leave that page out and add again`,
  mergeFailed: "Couldn't add to the wiki",
  listFailed: "Couldn't read the approval list",
  undoFailed: "Couldn't undo it",
  undone:
    "Undone from the wiki. Choose from the remaining pages and add them again. Pages you undid before don't come back to the list",
  title: 'Approvals',
  descRun: (run: string): string => `${run} — only pages you approve go into the wiki`,
  desc: 'Read the pages the AI made and choose only the ones to add',
  reload: 'Refresh',
  finalize: 'Add to wiki',
  confirmCount: (n: number): string => `Adds ${n} ${n === 1 ? 'page' : 'pages'} to the wiki`,
  confirmNone: 'There are no pages to add. Only the files that come with them are added',
  confirmRejected: (n: number): string => ` · ${n} left out this time`,
  cancel: 'Cancel',
  merge: 'Add',
  merged: (n: number): string => `${n} ${n === 1 ? 'page' : 'pages'} added to the wiki`,
  mergedRejected: (list: string): string => ` · left out this time: ${list}`,
  openGithub: 'View on GitHub',
  teamChecking: 'Team reviewing ·',
  openTeam: 'Open',
  shareFailed: (reason: string): string =>
    `It's in your wiki, but couldn't be sent to the team yet — ${reason}`,
  ahead: (n: number): string =>
    `${n} ${n === 1 ? "change hasn't" : "changes haven't"} been sent to the team yet. ${n === 1 ? 'It goes' : 'They go'} with your next approval`,
  nothingAhead: 'Nothing left to send to the team',
  openWiki: 'View in wiki',
  republish: 'Upload again',
  undo: 'Undo',
  line: (n: number): string => ` line ${n}`,
  read: 'Read',
  readDone: 'Opened',
  readLabel: (title: string): string => `Read ${title}`,
  rereadLabel: (title: string): string => `Read ${title} again (already read)`,
  rejectUndo: 'Undo reject',
  rejectPage: 'Reject this page',
  approveAll: 'Approve all',
  rejectAll: 'Reject all',
  source: (source: string): string => `Source ${source}`,
  decisionLabel: (title: string): string => `Choose whether to add ${title}`,
  approve: 'Approve',
  reject: 'Reject',
  others: (n: number): string => `${n} ${n === 1 ? 'file comes' : 'files come'} with the pages`,
  emptyTitle: 'No pages to approve',
  emptyBody:
    'Add sources and make a wiki draft, and the pages the AI made show up here. Only the ones you read and choose go into the wiki',
  loading: 'Loading pages to approve…',
  items: {
    source: { 'ai-lint': 'AI check', verify: 'Pre-add check' },
    readFailed: "Couldn't read the items to review",
    hiddenFailed: "Couldn't read the See later list. The main list is unchanged",
    dismissFailed: "Couldn't move the item to later",
    restoreFailed: "Couldn't bring the item back",
    empty: 'Nothing to review',
    title: 'To review',
    moved: 'Moved to See later — you can find it again in the folded list below',
    noDoc: "There's no linked document, so it can't be opened here",
    open: 'Open',
    later: 'Later',
    hidden: (n: number): string => `${n} ${n === 1 ? 'item' : 'items'} set aside for later`,
    stale: ' (refresh failed)',
    restore: 'Show again'
  }
}
