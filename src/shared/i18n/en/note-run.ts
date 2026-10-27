import type { noteRun as ko } from '../ko/note-run'

const READ_ONLY = 'this answer only reads'

export const noteRun: typeof ko = {
  wikiBusy: `Notes can be written once the wiki draft finishes — ${READ_ONLY}`,
  noteBusy: `Another conversation is writing notes — notes can be written once it finishes. This answer only reads`,
  stuck: `Notes can't be written while the library is mid-cleanup — restore the library state in Settings, then ask again. This answer only reads`,
  noGit: `Notes can't be written because this library can't keep a history — ${READ_ONLY}`,
  readFailed: `Notes can't be written because the library state couldn't be read — ${READ_ONLY}`,
  saveFailed: `Notes can't be written because your edits in the library couldn't be saved first — ${READ_ONLY}`,
  readOnly: (reason: string): string => `${reason} — ${READ_ONLY}`,
  unchecked: "Couldn't check the files written — check them in your library yourself",
  undoGone: 'The record needed to undo this was cleared',
  undoBusy:
    'A wiki draft or another answer is writing to the library — press again once it finishes',
  undoPending:
    "Can't undo while a wiki draft is waiting for approval — finish approving, then press again",
  undoStuck:
    "Can't undo while the library is mid-cleanup — restore the library state in Settings, then press again",
  undoFailed: "Couldn't undo it — press again in a moment",
  undoPartial: "Some files couldn't be undone — press again",
  reviewDone: 'This file was already undone or edited again afterwards',
  reviewEdited:
    "This file was edited after the answer wrote it, so it can't be split edit by edit — view it with Changes or undo it whole",
  reviewNoBase:
    "Couldn't find the content from before the answer, so it can't be split edit by edit",
  reviewMoved: 'The document changed in the meantime — the edits were read again',
  blocked: {
    newFolder: (rel: string): string =>
      `Left as is because the folder appeared during the run: ${rel}`,
    newFile: (rel: string): string => `Left as is because the file appeared during the run: ${rel}`,
    failed: (rel: string): string => `Couldn't undo: ${rel}`,
    restored: (rel: string): string => `Restored a file that was about to be deleted: ${rel}`,
    pending: (rel: string): string =>
      `Plans can be written once approvals are finished — undone: ${rel}`,
    denied: (rel: string): string => `Undone because it can't be written there: ${rel}`,
    outside: (path: string): string => `Tried to write outside the library: ${path}`,
    deniedTry: (rel: string): string => `Tried to write where it can't: ${rel}`,
    notCommitted:
      "The note was saved but couldn't be recorded in the history — it gets recorded with the next update",
    undoNotCommitted:
      "Undone, but it couldn't be recorded in the history — it gets recorded with the next update"
  },
  changes: {
    notFound: "Couldn't find this document",
    gone: "This answer's record was cleared, so the changes can't be shown",
    failed: "Couldn't read the changes",
    tooBig: 'There are too many edits to show them all',
    noBaseToday: 'There is no record from before this morning',
    noBaseYesterday: 'There is no record from before yesterday'
  }
}
