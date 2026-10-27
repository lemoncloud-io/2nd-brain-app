import type { engineMain as ko } from '../ko/engine-main'

export const engineMain: typeof ko = {
  lineSkipped: (line: string): string =>
    `Skipped a line of AI output that couldn't be read: ${line}`,
  notFinished: "The AI didn't finish its answer — try again",
  ingestRunning: 'A wiki draft is already being made in this library',
  timedOut: 'The AI took too long and was stopped. Check your internet connection and try again',
  unknownError: 'Unknown error',
  unreadable: "Couldn't read the AI's answer — try again",
  loginNeeded: (label: string): string => `You need to sign in to ${label}`,
  mcp: {
    urlTimeout: 'No answer within 10 seconds. Check the address',
    unreachable: "Can't reach the address. Check your internet connection and the address",
    spawnFailed: "Couldn't run the command. Check the command",
    commandTimeout: 'No answer within 10 seconds. Check the command and its arguments',
    badReply: 'The server sent an unexpected reply',
    exited: 'The server shut down right away',
    noTalk: "Couldn't talk to the server"
  },
  draft: {
    nothingQueued: 'No sources to draft — add sources to Waiting to wikify first',
    wikiMoved: (branch: string): string =>
      `The wiki (${branch}) changed while the draft was being made, so the result wasn't used — make it again`,
    notCollected: "The AI didn't keep the wiki draft separate — make it again",
    noPages: "The AI didn't make any wiki pages — check the progress log and make it again",
    leftover: (list: string): string =>
      `Some sources you added weren't processed: ${list} — make it again`
  },
  cli: {
    spawnFailed: (label: string, error: string): string =>
      `Couldn't run ${label} (${error}) — check the file permissions and path`,
    notInstalled: (label: string): string =>
      `${label} isn't installed on this computer — follow the install steps in Get started`
  },
  notVaultFolder: (dirs: string): string =>
    `This isn't a library folder. It needs VAULT_RULES.md and the ${dirs} folders`
}
