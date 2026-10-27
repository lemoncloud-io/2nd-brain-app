import type { mainErrors as ko } from '../ko/main-errors'

export const mainErrors: typeof ko = {
  badPath: 'That path is not valid',
  badName: 'That name is not valid',
  badRequest: "Couldn't handle the request",
  saveFailed: "Couldn't save",
  engineUnchecked: "The AI connection hasn't been checked yet. Check it in Settings",
  aiWriting: 'The AI is writing to the library right now. Try again when it finishes',
  ingestWriting: 'A wiki draft is being written to the library. Try again when it finishes',
  pickServerFailed: "Couldn't pick the server",
  serverNotSaved: "That server isn't saved. Add it again",
  thenSave: 'save again',
  thenMerge: 'merge again',
  thenUndo: 'undo again',
  thenSend: 'send again',
  thenDraft: 'make the wiki draft again',
  ingestBusyThen: (action: string): string =>
    `A wiki draft is being written to the library. When it finishes, ${action}`,
  noDefaultBranch: "Your library's history is incomplete — open the library again in Settings",
  draftPending: (action: string): string =>
    `A wiki draft is waiting for approval — add it to the wiki or reject it all in Approvals, then ${action}`,
  teamPending: (action: string): string =>
    `Your library has work the team is still reviewing — the app returns on its own once the team accepts it. To skip waiting, press "Restore library state" in Settings, then ${action}`
}
