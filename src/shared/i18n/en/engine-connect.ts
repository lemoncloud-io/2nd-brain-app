import type { engineConnect as ko } from '../ko/engine-connect'

export const engineConnect: typeof ko = {
  installTimeout: (name: string): string =>
    `Installing ${name} didn't finish in 10 minutes. Check your internet connection and try again`,
  installNotFound: (name: string): string =>
    `Installation finished, but ${name} wasn't found. If it's still like this after restarting the app, follow "Install it yourself" below`,
  installFailed: (name: string): string =>
    `Couldn't finish installing ${name}. Try again or follow "Install it yourself" below`,
  installStartFailed: "Couldn't start the installation",
  loginOpenFailed: "Couldn't open the sign-in window",
  stillLoggedIn: (name: string): string =>
    `${name} still looks signed in. Click again in a moment, or restart the app`,
  logoutFailed: "Couldn't disconnect",
  switchFailed: "Couldn't change which AI to connect",
  switchTo: (account: string, name: string): string => `Using ${account}? Connect ${name} instead`,
  joinPrefix: "Don't have a subscription? Get one first —",
  join: (plan: string): string => `Sign up for ${plan}`,
  checking: (name: string): string => `Checking ${name}…`,
  connected: (name: string): string => `${name} connected`,
  viaLogin: (via: string): string => `signed in with ${via}`,
  version: (version: string): string => ` · version ${version}`,
  limitPrefix: "You've hit the usage limit —",
  limitSoon: 'you can use it again in a while',
  limitAt: (at: number): string =>
    `you can use it again around ${new Date(at).toLocaleTimeString('en-US', { hour: 'numeric' })}`,
  limitSuffix: '. You are still connected.',
  accountUnknown: (account: string): string =>
    `Check which account you signed in with on the ${account} website`,
  logout: 'Disconnect',
  logoutTitle: 'Disconnect on this computer?',
  logoutDetail: (account: string | null, name: string): string =>
    `${name}${account ? ` for ${account}` : ''} will be disconnected. Your wiki and the sources you added stay, and you can pick up where you left off when you sign in again.`,
  keep: 'Keep',
  missingIntro: (name: string, account: string): string =>
    `Install the ${name} program on this computer once. It runs on your own ${account} account — you need a paid subscription, and you don't pay this app anything extra. You don't need to open a terminal.`,
  installing: 'Installing…',
  retry: 'Try again',
  install: (name: string): string => `Install ${name}`,
  installDownloading: 'Downloading the installer… this can take a few minutes',
  installStalled: (name: string): string =>
    `${name} isn't showing up yet. Look below for the message your terminal showed.`,
  manual: "If it doesn't work — install it yourself (last resort)",
  manualDone:
    'When the installation finishes, this screen moves on by itself (it checks for up to 10 minutes)',
  manualHints: (retry: boolean): string =>
    `First try the ${retry ? 'Try again' : 'Install'} button above. If that doesn't work, look for your terminal's message below`,
  recheck: 'Check again',
  docs: 'Install guide',
  unreadable: (name: string): string =>
    `${name} on this computer doesn't report whether you're signed in. The installed version may be old. 1. Copy the line below, paste it into a terminal and press Enter to reinstall, then 2. restart the app.`,
  loginIntro: (account: string): string =>
    `Sign in with your ${account} account. When the browser opens, sign in and come back to this window.`,
  loginReopen: 'Reopen sign-in window',
  loginBrowser: 'Sign in with browser',
  loginStalled:
    "Sign-in isn't confirmed yet. If you closed the browser window, open it again above.",
  loginWaiting: 'Once you finish signing in in the browser, this updates by itself'
}
