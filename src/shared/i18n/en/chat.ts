import type { chat as ko } from '../ko/chat'

export const chat: typeof ko = {
  filledAppended: 'Added after what you were typing in the chat box',
  filled: 'Filled in the chat box',
  copyCode: 'Copy code',
  thinkingActive: 'Thinking',
  thinking: 'Thoughts',
  openPath: (rel: string): string => `Open ${rel}`,
  wrapUpPrompt: "Summarize what I did today and update today's note"
}
