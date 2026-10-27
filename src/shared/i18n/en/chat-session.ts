import type { chatSession as ko } from '../ko/chat-session'

export const chatSession: typeof ko = {
  died: 'The AI stopped while answering — please ask again',
  busy: 'A question is already running',
  claudeStartFailed: "Couldn't start Claude — update Claude to the latest version, then ask again",
  claudeConnectFailed: "Couldn't run the AI — restart the app, then ask again",
  codexUpdateRequired: "Couldn't start Codex — update Codex to the latest version, then ask again"
}
