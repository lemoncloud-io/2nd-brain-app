import type { shell as ko } from '../ko/shell'

export const shell: typeof ko = {
  sidebarCollapse: 'Collapse sidebar',
  sidebarExpand: 'Expand sidebar',
  sidebarNarrow: 'Collapsed because the window is narrow. Collapse the chat panel to show it again',
  sidebarWidth: 'Sidebar width',
  sidebarViews: 'Sidebar views',
  chatCollapse: 'Collapse chat panel',
  chatExpand: 'Expand chat panel',
  chatPane: 'Chat panel',
  chatPaneWidth: 'Chat panel width',
  sidecar: 'side panel',
  sidecarOpened: (label: string): string => `Opened ${label} in the side panel`,
  resizeValue: (label: string, width: number): string => `${label} ${width} pixels`,
  openTabs: 'Open pages',
  closeTab: (label: string): string => `Close ${label} tab`,
  newTab: 'New tab',
  checking: 'Checking…',
  loading: 'Loading…',
  reading: 'Reading…',
  engineMissing: 'Not installed',
  engineConnected: (email: string | null): string => `Connected${email ? ` · ${email}` : ''}`,
  engineLoggedOut: 'Not signed in',
  vaultNotChosen: 'No library yet',
  vaultBroken: (dir: string): string => `${dir} — some folders are missing`,
  vaultSettings: 'Open library settings',
  change: 'Change',
  backToDoc: 'Back to page',
  knowledgeHint: "Sources, search, graph, checks, approvals — the things you don't use every day",
  appVersion: (version: string): string => `App version: ${version}`,
  syncPick: 'Choose in Approvals',
  syncSignIn: 'Sign in from Settings',
  syncConnect: 'Connect a team repository',
  syncRetry: 'Get again',
  syncReceive: 'Get',
  recheck: 'Check again',
  syncPickLabel: 'Choose pages edited by both you and the team',
  syncSignInLabel: 'Reconnect GitHub. Sign in from Settings',
  syncReceiveLabel: 'Get team changes',
  shareFailed: "Couldn't send to the team",
  sharing: 'Sending to the team…',
  shareNothing: 'Choose new pages to send below',
  shareMore: 'Send new edits',
  shareEdits: (n: number): string =>
    `${n} edited ${n === 1 ? 'page' : 'pages'} · ask the team to review`,
  shareOpenHint: 'Opens the GitHub review page in your browser',
  shareOpen: 'Team is reviewing · open',
  shareHeldReview: 'Waiting for approval — your edits go along with it',
  shareHeldPending:
    'Your earlier work is under team review — send new edits here once the review is done',
  shareFiles: (list: string): string => `Pages to send:\n${list}`,
  shareFreshFiles: (list: string): string => `Pages created outside the app:\n${list}`,
  shareWithFresh: (n: number): string => `Also send ${n} new ${n === 1 ? 'page' : 'pages'}`,
  restarting: 'Restarting…',
  restartForUpdate: (version: string): string => `New version ${version} · restart`,
  gate: {
    vaultNone: ['You need a library', 'Create a library to hold your wiki and sources first'],
    vaultInvalid: [
      "Can't open the library",
      'The folder was moved or something is missing. Open it again in Settings. To start over, use Create library in Get started'
    ],
    engineMissing: (name: string): [string, string] => [
      `Install ${name}`,
      name === 'Claude'
        ? 'Follow the one-line install guide in Get started'
        : 'Follow the install guide in Get started, or switch to Claude'
    ],
    engineUnreadable: (name: string): [string, string] => [
      `Reinstall ${name}`,
      "The installed version is too old to check whether you're signed in"
    ],
    engineLoggedOut: (name: string): [string, string] => [
      `Sign in to ${name}`,
      'Sign in with your browser from Get started'
    ],
    slow: 'Checking is taking a while',
    slowDetail:
      "The app couldn't check the library and AI connection. Check again, or open the library in Settings.",
    toStart: 'Go to Get started',
    toSettings: 'Go to Settings',
    checking:
      "Checking the library and AI connection… If it isn't done in 8 seconds, Check again appears"
  },
  setupRead: {
    journey: "Couldn't read your progress",
    remote: "Couldn't read the team repository connection",
    github: "Couldn't read your GitHub sign-in",
    vault: "Couldn't check the library",
    engine: "Couldn't check the AI connection",
    sync: "Couldn't read team changes",
    receive: "Couldn't get team changes"
  },
  nextStart: 'Go to Get started',
  nextIngest: 'Make a wiki draft',
  nextAdd: 'Add sources',
  details: 'Details',
  copied: 'Copied',
  copyFailed: "Couldn't copy. Select the text and copy it yourself",
  clear: 'Clear',
  linkOpenFailed: "Couldn't open this page",
  linkExcerpt: 'Showing the beginning only — click the link to open all of it',
  mediaUnplayable:
    "This computer can't play this format. Use the button below to open it in another app",
  unsavedTitle: 'You have unsaved writing',
  unsavedDetail:
    'If you discard, what you wrote this time is gone for good. To keep it, keep editing and save',
  keepEditing: 'Keep editing',
  discard: 'Discard',
  openInObsidian: 'Open in Obsidian',
  revealIn: (app: string): string => `Show in ${app}`,
  fileExplorer: 'File Explorer',
  fileManager: 'file manager',
  palette: {
    title: 'Find pages and commands',
    noCommand: 'No such command',
    noDocs: 'Your library has no pages yet',
    noRecent: 'No recently opened pages. Type a title or some text',
    searchFailed: (error: string): string => `${error} — showing title matches only`,
    commandName: 'Command name',
    inputLabel: 'Page title or text, > for commands',
    inputPlaceholder: 'Page title or text — > for commands',
    commands: 'Commands',
    docs: 'Pages',
    recent: 'Recently opened',
    body: 'In text',
    searchView: (text: string): string => `Find "${text}" in Search`,
    openDoc: 'Open'
  }
}
