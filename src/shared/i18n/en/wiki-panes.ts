import type { wikiPanes as ko } from '../ko/wiki-panes'

export const wikiPanes: typeof ko = {
  backlinks: {
    countFailed: "Couldn't count mentions",
    lineMoved: "That line changed, so the name couldn't be found",
    linkFailed: "Couldn't add the link",
    createFailed: "Couldn't create the note",
    creating: 'Creating note…',
    linking: 'Adding link…',
    title: 'Pages that link here',
    none: 'None yet',
    mentions: 'Places that mention this name without a link',
    linkHint: (term: string): string => `Turn "${term}" into a link to this document`,
    link: 'Add link',
    unresolved: 'Links that lead nowhere',
    createHint: (target: string): string => `Create the note "${target}"`,
    create: 'Create'
  },
  props: {
    labels: {
      created: 'Created',
      updated: 'Updated',
      title: 'Title',
      tags: 'Tags',
      source: 'Source',
      aliases: 'Aliases',
      status: 'Status',
      type: 'Type',
      next_action: 'Next action'
    } as Record<string, string>,
    value: (label: string): string => `${label} value`,
    editListHint: 'Click to edit — separate multiple values with commas',
    editHint: 'Click to edit',
    empty: 'Empty',
    remove: (label: string): string => `Remove ${label}`,
    add: 'Add property',
    newKey: 'Property name',
    newKeyPlaceholder: 'Name (e.g. owner)',
    newValue: 'Property value',
    newValuePlaceholder: 'Value',
    unreadable: "Couldn't read the properties at the top of this page. The body still reads fine",
    rest: (n: number): string => `${n} other ${n === 1 ? 'property' : 'properties'}`
  },
  diff: {
    readFailed: "Couldn't read this version",
    restoreFailed: "Couldn't restore it",
    same: 'This version is the same as the current text',
    differs: 'Lines that differ between this version and the current text',
    restoring: 'Restoring…',
    restore: 'Restore this version',
    close: 'Close comparison',
    closeHint: 'Close comparison — back to the document',
    moved:
      'The document changed while you were looking. Compare again with the current text before restoring',
    rebase: 'Compare again',
    tooLarge: 'The text is too long to show a line-by-line comparison',
    before: 'Earlier text',
    after: 'Current text'
  },
  history: {
    noTextTitle: 'This file has no history to show',
    noDocTitle: 'No document is open',
    noTextHint: 'Only text files have a history',
    noDocHint: 'Open a document to see its history here',
    close: 'Close history',
    readFailed: "Couldn't read the history",
    opened: (who: string, when: string): string =>
      `Opened the version by ${who} · ${when} in the center`,
    hint: 'Click a version to compare it with the current text',
    unrecorded: "This document is somewhere that doesn't keep history. Saving won't add versions",
    empty: 'No history yet. It starts building up once you save',
    labelsPartial:
      "Couldn't tell who made some of the edits. Versions written by the AI may show a person's name",
    list: 'Document history',
    truncated: (n: number): string => `Only the latest ${n} versions are shown`
  },
  outline: {
    openOnly: 'Unfinished only',
    nav: 'Document outline',
    changed: 'Changed section',
    title: 'Outline'
  },
  peek: {
    emptyTitle: 'No page picked yet',
    emptyHint:
      'Click a page name under an answer, a search result, a check or approval item, or a dot in the graph to read that page here',
    connections: 'Linked pages',
    fold: 'Show less',
    more: (n: number): string => `Show ${n} more`,
    region: 'Pages used',
    regionOf: (title: string): string => `Pages used: ${title}`,
    open: 'Open in wiki',
    close: 'Close pages used',
    gone: 'It may have been deleted or renamed',
    whole: 'The answer used this whole page'
  }
}
