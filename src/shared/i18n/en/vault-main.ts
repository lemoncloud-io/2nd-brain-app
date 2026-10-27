import type { vaultMain as ko } from '../ko/vault-main'

export const vaultMain: typeof ko = {
  notVault: (missing: string, dir: string): string =>
    `The folder you picked isn't a library — it's missing ${missing}. To start fresh, press Create library (${dir})`,
  openUnknown: "Couldn't open this folder for an unknown reason",
  repoNotEmpty:
    "The repository you picked already has content. Create a new empty repository and connect to it (this app won't write over someone else's content)",
  notRepoUrl:
    "That isn't a GitHub repository address. Paste it in the form https://github.com/account/repository",
  pickCloneParent:
    'Choose where to keep the team library. A folder named after the repository is created inside it',
  pickCreateParent: 'Choose where to keep your library. A 2nd-brain folder is created inside it',
  parentFailed: (dir: string): string => `Couldn't create the folder for your library (${dir})`,
  loginUnchecked:
    "Couldn't check your GitHub sign-in. Check your internet connection or sign in again, then create it again",
  createFailed: "Couldn't create the library. Create it again",
  pickCreateParentMaybe:
    "Choose where to keep your library. If the folder isn't empty, a 2nd-brain folder is created inside it",
  noOpenVault: 'No library is open',
  noOwner: "Can't tell where to create it. Pick again from the list",
  noRepoName: "Can't tell the repository name. Enter it again",
  linkProblem: 'Something went wrong while connecting.',
  createdNotPushed: (reason: string): string =>
    `Created and connected the team repository but couldn't upload. ${reason} · Upload again with Upload now`,
  createdNotLinked: (reason: string, url: string): string =>
    `Created the team repository but couldn't connect it. ${reason} · Enter ${url} under Connect an empty repository you already made`,
  linkFirst: 'Connect a team repository first',
  enterUsername: 'Enter a GitHub username',
  adoptable: (notes: number, dir: string): string =>
    `The folder you picked isn't a 2nd-brain library yet. It has ${notes} ${notes === 1 ? 'note' : 'notes'}. Use the button below to use it as a library and keep the notes as they are (${dir})`,
  pickNewWindow: 'Choose a library to open in a new window. This window stays as it is',
  newWindowFailed: "Couldn't open a new window. Try again",
  noVaultDir: "Can't tell the library folder. Pick again from the list",
  notRecent: "It's not in your recent libraries. Pick it again by opening the folder",
  pickAdoptFirst:
    'Pick the folder to use as a library first. Press Open an existing library or Obsidian folder',
  outsideVault: 'That path is outside your library',
  busyIngest: 'A wiki draft is already in progress',
  busyFinalize: 'Adding to the wiki is already in progress',
  busyNote: 'The chat is writing a note',
  busyVault: 'Something is writing to the library',
  busyChat: 'This conversation is already getting an answer',
  busyLint: 'An AI check is in progress',
  clipIngest:
    "Sources can't be added while a wiki draft is in progress. Add them again when it finishes",
  clipFinalize:
    "Sources can't be added while an approval is being applied. Add them again when it finishes",
  clipNote:
    "Sources can't be added while the chat is writing a note. Add them again after the answer finishes",
  editIngest: "Edits can't be saved while a wiki draft is in progress",
  editFinalize: "Edits can't be saved while adding to the wiki. Save when it finishes",
  editNote: "Can't save while the chat is writing a note. Save after the answer finishes",
  nameRule: 'Names can\'t use / \\ : * ? " < > | or start with a dot',
  nameTaken: (name: string): string => `"${name}" already exists here`,
  moveTaken: (name: string): string => `"${name}" already exists in the destination folder`,
  noNoteHere: "Notes can't be created in that folder",
  untitled: 'Untitled',
  noFolderHere: "Folders can't be created in that folder",
  newFolder: 'New folder',
  entryInvalid: "That item can't be changed",
  entryMissing: "Couldn't find that item",
  rawLocked: "Originals can't be moved or deleted. The wiki uses them as sources",
  topLocked: "The library's main folders can't be moved or deleted",
  rulesLocked: "The library's rule files can't be moved or deleted",
  noMoveIntoRaw: "Items can't be moved into Originals",
  noMoveThere: "Items can't be moved to that folder",
  noMoveIntoSelf: "A folder can't be moved into itself",
  emptyFile: 'The file is empty',
  attachTooBig: "Files bigger than 20MB can't be attached",
  baseInvalid: "This file can't be opened",
  baseMissing: "Couldn't find this file",
  bookmarksUnreadable:
    "Couldn't read the bookmarks file (.obsidian/bookmarks.json), so it wasn't changed",
  noFolder: "The folder doesn't exist",
  alreadyVault: "It's already a library. Just open it",
  adoptFailed:
    "Couldn't turn this folder into a library. The new files were removed and your notes are unchanged. Try again",
  emptyOnly: 'Only an empty folder can become a new library',
  seedFailed: "Couldn't create the library. The folder was emptied back to how it was. Try again",
  readOnlyFolder:
    'This folder is open for reading. Wiki drafts, checks and team sync only work in a 2nd-brain library. To keep using it, press Use this folder as my library to convert it',
  noSkeleton: (path: string): string => `The library skeleton is missing: ${path}`,
  noFolderAt: (path: string): string => `The folder doesn't exist: ${path}`,
  unknownTemplate: (name: string): string => `Unknown template: ${name}`,
  previewCut: (n: number): string =>
    `Slides from number ${n} on are too long to show here — view them in the default app`,
  templateNoFile: (path: string): string =>
    `The template can't be applied because the skeleton is missing a file: ${path}`,
  templateNoPlaceholder: (path: string): string =>
    `The template can't be applied because the skeleton has no topic placeholder: ${path}`
}
