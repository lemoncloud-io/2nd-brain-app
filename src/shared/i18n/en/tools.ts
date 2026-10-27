import type { tools as ko } from '../ko/tools'

export const tools: typeof ko = {
  mcp: 'Using a connected tool',
  ai: 'Using an AI tool',
  permissionTitle: 'The AI wants to use a tool — allow it?',
  allowCommand: 'Always allow this command in this chat',
  allowTool: 'Always allow in this chat',
  mode: {
    ask: { label: 'Ask', hint: 'Asks every time for tools outside what is allowed' },
    edits: { label: 'Edit files freely', hint: 'Edits files right away without asking' },
    all: { label: 'Allow everything', hint: 'Runs right away without asking — be careful' }
  }
}
