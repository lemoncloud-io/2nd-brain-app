import type { ingestMain as ko } from '../ko/ingest-main'

export const ingestMain: typeof ko = {
  phaseSync: 'Getting team changes…',
  phaseEngine: 'Getting the AI ready…',
  phaseWrite: 'The AI is reading your sources and writing the wiki…',
  phaseDraft: 'The AI is writing drafts…',
  phaseAssemble: 'Organizing into the wiki…',
  stranded: ' — clean it up in Approvals, then make it again',
  canceled: 'Canceled the wiki draft',
  canceledTail: ' — your sources are still in Waiting to wikify',
  noneWritten: (n: number): string =>
    `The AI couldn't write any wiki draft (${n} ${n === 1 ? 'source' : 'sources'})`,
  againTail: ' — make it again',
  allOverlap: 'Every AI draft overlapped an existing page, so nothing new was added',
  saveBeforeFailed:
    "Couldn't save library edits before making the wiki draft — make it again in a moment",
  prepareStopped:
    'Stopped while getting ready to make the wiki draft — your sources are untouched, so make it again'
}
