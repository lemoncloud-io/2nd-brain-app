import type { onboarding as ko } from '../ko/onboarding'

export const onboarding: typeof ko = {
  stepPosition: (position: number, total: number): string => `Step ${position} of ${total}`,
  purposeQuestion: 'What would you like to organize with 2nd-brain?',
  purposePlaceholder: "e.g. I want to gather our team's server operations know-how in one place",
  purposeNote:
    "It's saved in your library's direction page, and the AI refers to it when writing the wiki. You can change it later.",
  githubPrivateNote: 'Uploaded to a private repository in your GitHub account · originals included',
  githubRequired:
    'To keep your wiki and sources on your GitHub, you need to sign in once. Your password never goes into the app.',
  githubLaterNote:
    'If you do it later, the library is created only on this computer. You can upload it to GitHub in the last step of Get started or in Settings.',
  starterGithubNote:
    'Creates a library on your GitHub and downloads it to the Documents folder on this computer. No need to pick a folder.',
  starterLocalNote:
    'Creates it in the Documents folder on this computer. You can upload it to GitHub later in the last step of Get started or in Settings.',
  starterProgressGithub: 'Creating a library on your GitHub and downloading it…',
  starterProgressLocal: 'Creating the library…',
  starterLocalPublishFailed: "Created on this computer · couldn't upload to GitHub",
  starterLocal: 'Created on this computer',
  starterSkeleton: 'Created as a basic library and ',
  starterPublished: (origin: string, repo: string): string =>
    `${origin === '' ? 'Uploaded' : `${origin}uploaded`} to a private repository on your GitHub${repo ? ` · ${repo}` : ''}`,
  starterPublishFailed:
    "The library was created, but couldn't be uploaded to GitHub. Upload it again from Upload to GitHub above.",
  publishLater: 'You can upload to GitHub later'
}
