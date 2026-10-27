import type { reviewMain as ko } from '../ko/review-main'

export const reviewMain: typeof ko = {
  badRejects: 'The rejected list format is not valid',
  badBranch: 'The draft name is not valid',
  gitFailure: (what: string, detail: string): string =>
    `${what} — stopped while changing the library history. Try again, and if it keeps happening, copy this message and let us know (${detail})`,
  nothingToApprove: 'No wiki draft to approve. Pages show up here once a wiki draft is done',
  rawChanged: (list: string): string =>
    `Original files were changed or deleted, so nothing was added to the wiki. Originals can only be added to: ${list}`,
  unknownReject: (list: string): string =>
    `Tried to reject pages that aren't in the approval list: ${list} — refresh and pick again`,
  applyFailed: "Couldn't add it to the wiki",
  notDraft: "That isn't a wiki draft that can be undone",
  noDraftToUndo: 'No wiki draft to undo. It was already undone or another wiki draft has started',
  undoMoved:
    "The wiki changed again after it was added, so it can't be undone. There were edits or another wiki draft afterwards",
  unsavedVault: "The library has unsaved changes, so it can't be undone",
  undoPushed: "This wiki draft is already on GitHub, so it can't be undone",
  unapplyFailed: "Couldn't take it back out",
  draftPrUnknown:
    "Can't tell whether the wiki draft request the team is reviewing is still open. Press again in a moment",
  editPrUnknown:
    "Can't tell whether your open team review request is still open. Press again in a moment"
}
