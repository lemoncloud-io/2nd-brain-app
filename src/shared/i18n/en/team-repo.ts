import type { teamRepo as ko } from '../ko/team-repo'

export const teamRepo: typeof ko = {
  orgsFailed: "Couldn't read your organizations",
  createUnfinished:
    "Creating the team repository didn't finish. Check on GitHub whether the repository was created",
  createTitle: 'Create a team repository',
  createIntro:
    'Creates a private repository on GitHub for your library and uploads it right away. Fine to use alone — you can invite teammates later.',
  owner: 'Create in',
  myAccount: (login: string | null): string => `My account${login ? ` (${login})` : ''}`,
  org: (org: string): string => `${org} organization`,
  repoName: 'Repository name',
  createAndUpload: 'Create and upload',
  signInFirst: "Sign in to GitHub above first. If you don't have an account,",
  signUp: 'create one first',
  signUpFree: "— it's free",
  reload: 'Load again',
  creating: 'Creating and uploading…',
  orgSettings: 'Open GitHub organization settings',
  inviteFailed: "Couldn't send the invitation",
  inviteTitle: 'Invite teammates',
  inviteIntro:
    "Enter a teammate's GitHub username to invite them to this repository. They accept the invitation in the app under 'Join a team library'.",
  invitePlaceholder: 'GitHub username',
  invite: 'Invite',
  invited: (who: string): string =>
    `${who} — invitation sent. They join once they accept it under Join a team library in the app`,
  alreadyMember: (who: string): string => `${who} — already in this repository`,
  disconnectFailed: "Couldn't disconnect GitHub",
  pushFailed: "Couldn't upload to GitHub",
  pushing: 'Uploading…',
  pushed: 'Uploaded to GitHub',
  connected: 'Connected ·',
  publicWarning:
    'Anyone can see this repository without signing in. Your uploaded wiki and original sources are public. Make the repository private on GitHub, or switch to another repository below.',
  uploads: (approveUpload: string): string =>
    `What gets uploaded: your approved wiki and the original sources you added. Wiki drafts aren't uploaded before approval. ${approveUpload} Pages you edited without a wiki draft go through "Ask the team to review" in the sidebar.`,
  pushWarning:
    'This button skips team review and uploads your library as is. If you share this library with a team, send from the Approvals screen instead — that way it goes in after the team reviews it.',
  pushNow: 'Upload now',
  change: 'Switch to another repository',
  disconnect: 'Disconnect',
  disconnectTitle: 'Disconnect only on this computer?',
  disconnectDetail:
    'Nothing uploads automatically from now on. What is already on GitHub stays there. To delete it, delete the repository on GitHub.',
  keep: 'Keep',
  uploadsShort: (approveUpload: string): string =>
    `What gets uploaded is your approved wiki and the original sources you added. ${approveUpload}`,
  pasteOpen: 'Connect an empty repository you already made',
  urlPlaceholder: 'https://github.com/my-account/2nd-brain',
  urlLabel: 'GitHub repository address',
  connectAndUpload: 'Connect and upload',
  urlHint: 'It must be an empty private repository. Connecting uploads once right away',
  cancelChange: 'Cancel and keep the current repository',
  noVault: 'You can connect after creating your library'
}
