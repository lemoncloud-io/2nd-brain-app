import type { chatActions as ko } from '../ko/chat-actions'

export const chatActions: typeof ko = {
  ingest: 'Make a wiki draft',
  review: 'See pages to approve',
  lint: 'Run a check',
  clip: 'Add sources',
  examples: [
    "Create today's note",
    "Gather only yesterday's open items",
    'Turn this plan into a checklist',
    'Organize the sources I added into the wiki'
  ]
}
