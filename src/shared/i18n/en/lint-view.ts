import type { lintView as ko } from '../ko/lint-view'

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

export const lintView: typeof ko = {
  title: 'Check',
  description: 'Check that your wiki pages link to each other well',
  kinds: {
    orphan: {
      label: 'Pages nothing opens',
      hint: 'No other page links here, so it is hard to find'
    },
    'broken-link': {
      label: 'Links that lead nowhere',
      hint: "The page it points to doesn't exist. Create it or fix the link"
    },
    'no-outlinks': {
      label: "Pages that don't lead anywhere",
      hint: 'This page has no links to other pages'
    }
  },
  brokenLink: (target: string, line: number): string =>
    `Link that leads nowhere: ${target} (line ${line})`,
  failed: "Couldn't run the check",
  failedHint: 'Check again in a moment, or make sure your library is open in Settings',
  again: 'Check again',
  checking: 'Checking…',
  filterGroup: 'Filter by kind',
  all: 'All',
  kindCount: (label: string, n: number, hint: string): string => `${label}: ${n} — ${hint}`,
  cleanTitle: 'Nothing to fix',
  cleanHint: 'Your pages link to each other well',
  noKindMatch: (label: string): string => `No problems in "${label}" — try another kind`,
  verify: {
    head: 'Library rules check —',
    pass: 'all good',
    fail: 'some things to fix',
    unavailable: "couldn't check",
    cannotRun: "The rules check can't run on this library. The list above still works"
  },
  unresolved: {
    title: "Links to pages that don't exist yet",
    create: 'Create',
    createFailed: "Couldn't create the note",
    created: (target: string): string => `Created and opened the note '${target}'`
  },
  ai: {
    title: 'AI check',
    intro:
      'The AI reads your pages to find contradictions, outdated content and missing pages. It takes a few minutes and uses your subscription.',
    run: 'Run AI check',
    confirm: (n: number): string => `About ${n} ${plural(n, 'page', 'pages')} will be checked`,
    start: 'Start',
    cancel: 'Cancel',
    reading: (n: number, total: number): string => `Reading page ${n}/${total}`,
    running: 'Checking',
    stopping: 'Stopping…',
    stop: 'Stop',
    found: (n: number): string => `${n} ${plural(n, 'finding', 'findings')}`,
    merge: 'Merge the two pages',
    clean: 'No problems found',
    unparsed: "Couldn't read the AI's answer. Checking again usually fixes this",
    failed: "Couldn't finish the AI check",
    kind: {
      contradiction: 'Contradiction',
      outdated: 'Outdated',
      'missing-page': 'Missing page',
      suggestion: 'Suggestion',
      duplicate: 'Duplicate'
    },
    severity: { high: 'Urgent', medium: 'Normal', low: 'Low' } as Record<string, string>,
    severityDefault: 'Normal'
  },
  merge: {
    title: 'Merge two pages',
    proposing: 'The AI is writing the merged page ·',
    proposeFailed: "Couldn't make a merge proposal",
    applyFailed: "Couldn't merge",
    undoFailed: "Couldn't undo",
    summary: (keep: string, drop: string): string =>
      `Merges into ${keep} and deletes ${drop}. Searching for that name opens ${keep}.`,
    noEdits: 'No links need fixing.',
    edits: 'Documents whose links get fixed:',
    edit: (name: string, count: number): string => `${name} (${count})`,
    moreEdits: (n: number): string => ` and ${n} more`,
    body: 'Merged page',
    keep: (title: string): string => `Page kept — ${title}`,
    drop: (title: string): string => `Page deleted — ${title}`,
    merged: (keep: string, drop: string, edited: number): string =>
      `Merged. Searching for ${drop} now opens ${keep}${edited > 0 ? ` · fixed links in ${edited} ${plural(edited, 'document', 'documents')}` : ''}.`,
    undone: 'Undid the merge.',
    dismiss: 'Never mind',
    applying: 'Merging…',
    apply: 'Merge',
    undoing: 'Undoing…',
    undo: 'Undo',
    open: 'Open the merged page',
    stop: 'Stop',
    close: 'Close'
  }
}
