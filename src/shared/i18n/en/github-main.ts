import type { githubMain as ko } from '../ko/github-main'

export const githubMain: typeof ko = {
  loginAbove: 'You need to sign in to GitHub. Press Sign in to GitHub above first',
  offline: "Couldn't connect to GitHub. Check your internet connection and try again",
  denied: "You didn't approve the sign-in. Press Sign in to GitHub again",
  expired: 'The code expired. Press Sign in to GitHub again',
  orgBlockedLogin:
    'A GitHub organization blocks this sign-in. An organization admin needs to approve it',
  slowDown: 'GitHub asked us to wait. Press Sign in to GitHub again in a moment',
  noCode: "Couldn't get a sign-in code from GitHub. Press again in a moment",
  unreachable: "Couldn't connect to GitHub. Check your internet connection",
  startFirst: 'Start signing in first',
  loginUnfinished: (code: string): string => `GitHub sign-in didn't finish (${code})`,
  needLogin: 'You need to sign in to GitHub. Sign in under Team repository in Settings',
  alreadySent: 'This was already sent to the team and is waiting for review. Check it with Open',
  orgBlocked: 'A GitHub organization blocks this app. An organization admin needs to approve it',
  noPushRight: (status: number): string =>
    `You don't have permission to send to the team repository. Check that you're signed in with an account that can write to it (${status})`,
  repoNotFound: "Couldn't find the team repository. Check the address and your access",
  sendFailed: (status: number): string => `Couldn't send to the team (${status})`,
  notGithubRepo: "The team repository isn't a GitHub address",
  noResult: "Didn't get a result from GitHub. Check the repository directly",
  linkNeedLogin:
    'Reading the GitHub address in your question needs a GitHub sign-in — sign in under Team repository in Settings',
  linkLoginAgain:
    "Your GitHub sign-in expired, so the address couldn't be read — sign in again under Team repository in Settings",
  linkOrgBlocked:
    "A GitHub organization blocks this app, so the address couldn't be read — an organization admin needs to approve it",
  linkNotVisible:
    "Couldn't read the GitHub address — check that it's right and that your account can see that repository",
  linkBusy:
    "GitHub isn't taking requests for a moment, so the address couldn't be read — ask again in a moment",
  filesUnread:
    "Couldn't read the changed files of the GitHub PR — answering from the title and description only. Ask again in a moment",
  linksUnread:
    "Couldn't read the address in your question, so the answer doesn't use it — ask again in a moment",
  tooManyLinks: (n: number): string =>
    `Up to ${n} GitHub addresses are read at a time — ask about the rest separately`,
  linkFailed: (status: number): string =>
    `Couldn't read the GitHub address (${status}) — ask again in a moment`,
  reloginOrgs:
    'To see organizations, sign in to GitHub again. Sign out, then sign in again. You can still create it in your own account',
  signedOut: 'Your GitHub sign-in expired. Sign out above, then sign in again',
  repoExists: 'A repository with that name already exists. Enter a different name',
  orgsFailed: "Couldn't read your organizations. Load them again in a moment",
  badRepoName:
    'Repository names can use letters, numbers, dots, underscores and hyphens, up to 100 characters',
  noOrg: "Can't tell the organization name. Pick again from the list",
  noRepoUrl: "Didn't get the new repository's address from GitHub. Check on GitHub",
  orgBlocksApp: (org: string): string =>
    `The ${org} organization blocks this app. An organization admin has to allow it in the GitHub organization settings first`,
  orgNoRight: (org: string): string =>
    `You can't create repositories in the ${org} organization. Get permission from an organization admin or create it in your own account`,
  createFailed: (status: number): string =>
    `Couldn't create the repository (${status}). Try again in a moment`,
  badUsername: 'GitHub usernames use letters, numbers and hyphens. Enter it without @',
  noSuchUser: (name: string): string => `There's no GitHub user ${name}. Check the spelling`,
  userCheckFailed: (status: number): string =>
    `Couldn't check the username (${status}). Invite again in a moment`,
  noInviteRight:
    "You can't invite teammates. Check that you're signed in with the account that created the team repository",
  inviteFailed: (status: number): string => `Couldn't invite (${status}). Invite again in a moment`,
  joinableFailed: "Couldn't load the libraries you can join. Load them again in a moment",
  vaultCheckFailed:
    "Couldn't check whether it's a library. Check your internet connection and load again in a moment",
  unknownInvite: "Can't find that invitation. Load the list again",
  acceptFailed: (status: number): string =>
    `Couldn't accept the invitation (${status}). Try again in a moment`,
  noOwner: "Can't tell where to create the repository. Sign in to GitHub again",
  templateHidden: "Can't see the library template",
  starterFailed: (status: number): string =>
    `Couldn't create the repository on GitHub (${status}). Try again in a moment or press Do it later`,
  starterTaken: (name: string, n: number): string =>
    `Your GitHub already has ${n} repositories named ${name}. Clean one up, then try again`
}
