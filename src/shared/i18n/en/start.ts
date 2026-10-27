import type { start as ko } from '../ko/start'

export const start: typeof ko = {
  title: 'Get started',
  backToSettings: 'Back to Settings',
  intro:
    'Your library is the folder that holds your pages; the AI connection uses your own AI subscription. Making a wiki draft means the AI reads your sources and writes a draft, so it uses your subscription.',
  doneTitle: "You're all set",
  doneBody:
    "Now tell the chat to write today's note, and read pages right next to it. Turning the sources you added into wiki pages happens in Knowledge.",
  openToday: "Open today's note",
  stepsLabel: 'Setup steps',
  checking: 'Checking…',
  teamRepo: 'Team repository',
  teamRepoHint: '· invite teammates, change the connection',
  descDone: "You're all set",
  descDoneLater: (later: string): string => `You're all set · ${later}`,
  descReturning: (later: string): string => `Two setup steps and you're in · ${later}`,
  descSteps: (n: number): string => `Get started in ${n} steps`,
  purpose: {
    title: 'What you want to organize',
    laterVault: "You can write it in the library's direction page",
    skipped: 'You chose to write it later'
  },
  engine: {
    title: (name: string): string => `Connect ${name}`,
    later:
      'The AI reads your sources and writes the wiki. Connect it with your subscription account',
    connected: (name: string): string => `${name} connected`
  },
  github: {
    title: 'Connect GitHub',
    later: 'Sign in with your GitHub account',
    connected: 'GitHub connected',
    deferred: 'You chose to do this later',
    notYet: 'Not uploaded to GitHub yet'
  },
  vault: {
    title: 'Create your library',
    later: 'Create a folder to hold your wiki and sources',
    ready: 'Library ready'
  },
  publish: {
    title: 'Upload to GitHub',
    later: 'Optional · keep your approved wiki and sources on your GitHub'
  },
  first: {
    label: 'First 3 steps',
    heading: 'Three steps to your own wiki',
    headingHint: '· about 10 minutes',
    intro:
      "Follow along one at a time. This isn't a daily task, so you can skip these and just write today's note.",
    complete: "Your first wiki is done. From now on, spend your days in today's note and the chat.",
    toToday: "Go to today's note",
    checking: 'Checking steps…',
    today: {
      title: "Write today's note",
      later: "Each day starts in today's note",
      summary: "Today's note ready",
      fromChat: "Make today's note in the chat",
      fromChatHint: 'A sentence is filled into the chat box. Read it and press Enter'
    },
    clip: {
      title: 'Add sources and make a wiki draft',
      later: 'Turns the sources you added into a wiki draft',
      summary: 'Wiki draft done',
      waiting: (n: number): string => `${n} ${n === 1 ? 'source is' : 'sources are'} waiting`,
      ingest: 'Make a wiki draft',
      ingestHint: 'Takes a few minutes and uses your subscription',
      add: 'Add sources',
      addHint: 'Add files or web addresses. If you have nothing at hand, start with the sample'
    },
    approve: {
      title: 'Approve into the wiki',
      later: 'Only the drafts you pick go into the wiki',
      summary: 'First wiki complete',
      open: 'See pages to approve'
    }
  }
}
