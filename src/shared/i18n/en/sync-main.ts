import type { syncMain as ko } from '../ko/sync-main'

export const syncMain: typeof ko = {
  pullFailed: "Couldn't get team changes. Try again in a moment",
  pullBeforeSend:
    "Couldn't get team changes, so nothing was sent. Follow the notice at the top of the sidebar, then send again",
  sending: 'Already sending',
  conflict:
    'You and your team edited the same document separately. Pick which version to keep in Approvals first',
  draftWaiting:
    'A wiki draft is waiting for approval. Once you approve it, your edits go along with it',
  ingestRunning: 'A wiki draft or approval is in progress. Send again when it finishes',
  loginNeeded:
    'You need to sign in to GitHub. Sign in under Team repository in Settings, then send again',
  notLinked:
    "You're not connected to a team repository. Connect one under Team repository in Settings",
  nothingToSend: 'No edits to send to the team',
  unknownPick: "Can't tell which one to keep",
  conflictPending: (action: string): string =>
    `You haven't picked a version for a document two people edited. Pick one in Approvals, then ${action}`,
  midMerge: (action: string): string =>
    `Merging team changes stopped partway. Do what the top line of the sidebar says first, then ${action}`,
  fetchLogin:
    'You need to sign in to GitHub. Sign in under Team repository in Settings, then get changes again',
  loginExpired:
    'Your GitHub sign-in expired. Sign out under Team repository in Settings, then sign in again',
  fetchNotFound:
    "Couldn't connect to the team repository. Check the address and that you're signed in with an account that can see it",
  fetchOffline:
    "Couldn't connect to the team repository. Check your internet connection and get changes again",
  fetchTimeout: "Couldn't connect to the team repository. Get changes again in a moment",
  fetchFailed: "Couldn't get team changes",
  pushConflict:
    'You and your team edited the same document separately. Pick which version to keep in Approvals, then upload',
  pushStuck:
    "Couldn't get team changes, so nothing was uploaded. Follow the notice at the top of the sidebar, then upload again",
  mergeFailed:
    "Couldn't merge team changes. Restore the library state in Settings, then get changes again",
  switchFailed: "Couldn't move to the team's latest. Get changes again in a moment",
  restoreDraft:
    'A wiki draft is waiting for approval. Add it to the wiki or reject it all in Approvals',
  restorePick:
    'Some documents are waiting for you to pick a version. Pick them when getting team changes, then press again',
  restoreForeign:
    'Another tool stopped partway while changing the library. Ask a teammate who manages this library for help',
  restoreBusy: 'A wiki draft or approval is writing to the library. Press again when it finishes',
  restoreSwitch:
    'A new file has the same name as a team document, so nothing was restored. Move or rename that file, then press again',
  restoreCarry:
    "Documents you edited in the app overlap ones the team is reviewing, so they can't be brought over. The app returns on its own once the team accepts them",
  pickUnavailable: "That document can't be picked right now. Reload the list",
  bothUnreadable: "Couldn't read both versions. Get team changes again, then pick",
  restoreLocal: (list: string): string =>
    `Work made outside the app exists only on this computer, so nothing was restored — restoring would hide it in the app: ${list} · Ask whoever made it to send it to the team first`,
  publicRepo:
    'This repository is visible to anyone without signing in, so nothing was uploaded. Make it Private on GitHub, or create a new private repository and connect that',
  pushNotFound:
    "Couldn't find the repository on GitHub. Check the address, or check that your signed-in account has that repository",
  pushLogin:
    'You need to sign in to GitHub. Sign in under Team repository in Settings, then upload again',
  pushBehind:
    "The GitHub repository has team changes you haven't got yet. Press the top line of the sidebar to get them, then upload again",
  pushOffline: "Couldn't connect to GitHub. Check your internet connection and upload again",
  githubNotLinked:
    'No GitHub repository is connected. Connect one under Team repository in Settings',
  pushFailed: "Couldn't upload to GitHub",
  sendFailed: "Couldn't send to the team",
  pushTimeout: (minutes: number): string =>
    `Stopped after ${minutes} minutes without finishing the upload. Check your internet connection and upload again`,
  cloneLogin: 'You need to sign in to GitHub. Finish signing in to GitHub above, then get it again',
  cloneNotFound:
    "Couldn't find the repository. Check the address and that you're signed in with an account that can see it",
  cloneOffline:
    "Couldn't connect to the repository. Check your internet connection and get it again",
  cloneBadUrl:
    "That isn't a repository address. Paste it in the form https://github.com/account/repository",
  cloneTimeout: 'It took too long and stopped. Check your internet connection and get it again',
  cloneEmpty: 'The repository is still empty. Get it again in a moment',
  cloneReadOnly: "It's a read-only folder, so it can't be used as a team library",
  cloneFailed: "Couldn't get the library",
  cloneExists: (name: string): string =>
    `A ${name} folder already exists. Pick another place, or open that folder with 'Open an existing library or Obsidian folder'`,
  cloneMissing: (missing: string): string => `The library is missing ${missing}`,
  cloneNotVault: (detail: string): string => `The repository you got isn't a library. ${detail}`,
  createdNotLinked:
    "Created the GitHub repository but couldn't connect it. Upload again with Upload to GitHub"
}
