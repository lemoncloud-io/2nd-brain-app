import type { doc as ko } from '../ko/doc'

export const doc: typeof ko = {
  count: (chars: string, words: string): string =>
    `${chars} ${chars === '1' ? 'character' : 'characters'} · ${words} ${words === '1' ? 'word' : 'words'}`,
  versionAi: 'Written by AI',
  versionMe: 'Edited by me',
  versionPerson: (author: string): string => `Edited by ${author}`,
  versionApp: 'Edited',
  taskDone: 'Done',
  taskUndone: 'Mark as not done',
  task: 'To-do',
  propertiesChip: (n: number): string => `${n === 1 ? '1 property' : `${n} properties`} · Expand`,
  propertiesChipHint:
    'Click to expand (or press ↑ on the first line of the body). It folds again when you go back to the text',
  deletedLines: (n: number): string => `${n === 1 ? '1 deleted line' : `${n} deleted lines`}`,
  diagramFallback: "Couldn't draw the diagram, so here's the source",
  diagramFailed: "Couldn't read the diagram",
  readFailed: "Couldn't read the source",
  tooSlow: 'It took too long',
  loadFailed: (status: number): string => `Couldn't load it (${status})`
}
