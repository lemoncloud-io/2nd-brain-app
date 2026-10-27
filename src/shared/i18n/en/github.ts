import type { github as ko } from '../ko/github'

export const github: typeof ko = {
  sshUrl:
    "That's an SSH address. Paste the https://github.com/… address from the repository page's address bar",
  innerUrl:
    "That's an address inside a repository. Paste only up to the repository's main page (github.com/account/repository)",
  notGithub: "That's not a GitHub address. Paste a repository address that starts with github.com",
  urlShape: 'Paste it in the form https://github.com/account/repository'
}
