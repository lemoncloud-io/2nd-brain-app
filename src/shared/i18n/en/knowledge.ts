import type { knowledge as ko } from '../ko/knowledge'

export const knowledge: typeof ko = {
  sections: {
    sources: {
      label: 'Sources',
      describe: 'Where you add files and web addresses',
      countWord: 'sources waiting'
    },
    search: { label: 'Search', describe: 'Where you find documents and files', countWord: '' },
    graph: { label: 'Graph', describe: 'Where you see the links in 3D', countWord: '' },
    lint: { label: 'Check', describe: 'Where you check and fix links', countWord: 'to do' },
    review: {
      label: 'Approvals',
      describe: 'Where you check things before they go into the wiki',
      countWord: 'awaiting approval'
    }
  },
  tabCount: (label: string, word: string, n: number): string => `${label} — ${n} ${word}`,
  backToStart: 'Back to the first 3 steps',
  search: {
    title: 'Search',
    description:
      'Find documents by the words in them, and files like PDFs and images by name — ask questions in chat',
    input: 'Search by words or content in your pages',
    placeholder: 'Search by words or content in your pages — e.g. meeting, moving',
    clear: 'Clear search',
    retry: 'Search again',
    pending: 'Searching…',
    hint: 'Type words or content to search your documents — names find files too',
    empty: 'Nothing found in your documents',
    askChat: 'Ask in chat'
  }
}
