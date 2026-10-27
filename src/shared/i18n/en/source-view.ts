import type { sourceView as ko } from '../ko/source-view'

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

export const sourceView: typeof ko = {
  history: "This file's history — see who changed it and when in the side panel",
  edit: 'Edit this file',
  saved: 'Saved',
  previewOf: (name: string): string => `${name} preview`,
  bodyOf: (name: string): string => `${name} contents`,
  saving: 'Saving…',
  save: 'Save',
  discard: 'Discard changes',
  discardConfirm: 'Really discard',
  cancel: 'Cancel',
  dirty: 'Unsaved changes',
  saveKey: '⌘S to save',
  comparing: 'Comparing versions —',
  unsupported: "This app can't preview this format",
  unsupportedHint:
    'Images, PDF, Word, PowerPoint, text, tables, web pages, audio and video open right here',
  source: 'Source',
  showSource: 'View source',
  table: {
    rowsCut: (total: number, shown: number, width: number): string =>
      `First ${shown.toLocaleString('en')} of ${total.toLocaleString('en')} rows · ${width} ${plural(width, 'column', 'columns')}`,
    rows: (total: number, width: number): string =>
      `${total.toLocaleString('en')} ${plural(total, 'row', 'rows')} · ${width} ${plural(width, 'column', 'columns')}`,
    asTable: 'View as table'
  },
  pdf: {
    failed: "Couldn't open the PDF",
    pageOf: (rel: string, page: number, total: number): string => `${rel} page ${page} / ${total}`,
    pages: (page: number, total: number): string => `Page ${page} of ${total}`,
    previous: 'Previous page',
    next: 'Next page'
  },
  base: {
    failed: "Couldn't read this table",
    truncated: (total: number, seen: number): string =>
      `Counted only the first ${seen} of ${total} library documents`,
    count: (n: number): string => `${n} ${plural(n, 'item', 'items')}`,
    noGroup: 'None',
    empty: 'No documents match these conditions'
  },
  markdown: {
    readOnly: 'Read only',
    asDoc: 'View as document'
  },
  html: {
    note: 'Shown as a page on its own. If it looks empty, open it in your browser',
    openBrowser: 'Open in browser',
    asPage: 'View as page'
  },
  code: {
    notJson: "This isn't valid JSON. Showing the source as is",
    tooBig: "It's a large file. Showing the source as is, without re-indenting"
  }
}
