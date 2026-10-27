import type { today as ko } from '../ko/today'

export const today: typeof ko = {
  previousLeft: (date: string | null, n: number): string =>
    `${date === null ? 'Earlier' : date} note: ${n} left to do`,
  backToToday: "To today's note",
  previousHint: (rel: string): string => `${rel} — go to the first unfinished spot`,
  progress: 'Today',
  progressSr: (total: number, done: number): string =>
    `${done} of ${total} ${total === 1 ? 'task' : 'tasks'} done today`,
  wrapUp: 'Wrap up today in chat',
  wrapUpHint:
    "Fills the chat box with a wrap-up request. If you were typing, it's added after your text. Read it, then press Enter to send",
  blank: {
    createToday: "Create today's note",
    createFilled: (note: string): string => `${note} — press Enter to send and create it`,
    openToday: "Open today's note",
    find: 'Find and open a document',
    newNote: 'New note',
    close: 'Close this tab',
    firstTime: 'New here? See Get started'
  },
  docOpened: (folder: string): string => `Opened a document in ${folder}`
}
