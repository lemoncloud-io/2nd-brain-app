import type { engineFailure as ko } from '../ko/engine-failure'

const pad = (n: number): string => String(n).padStart(2, '0')

export const engineFailure: typeof ko = {
  clock: (hours: number, minutes: number): string => `${hours}:${pad(minutes)}`,
  usageLimitAt: (lead: string, at: string): string =>
    `${lead}You've reached the AI usage limit. You can use it again around ${at}`,
  usageLimit: (lead: string): string =>
    `${lead}You've reached the AI usage limit. You can use it again in a while`,
  contextTooLong: (lead: string): string =>
    `${lead}There's too much to handle at once. Ask in a new chat or add the sources in smaller parts`,
  overloaded: (lead: string): string => `${lead}The AI is busy right now. Try again in a moment`,
  offline: (lead: string): string =>
    `${lead}Couldn't connect to the internet. Check your connection and try again`,
  sessionExpired: (lead: string): string => `${lead}Couldn't continue the previous chat`,
  unknown: "Couldn't run the AI"
}
