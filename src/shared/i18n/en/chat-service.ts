import type { chatService as ko } from '../ko/chat-service'

const PASTE = 'copy the content and paste it into your question'

export const chatService: typeof ko = {
  searchFailed:
    "Couldn't search your library, so this was answered without using any pages — if the answer falls short, ask again",
  sourceOnlyEmpty:
    'Searching without the wiki found no documents to use — turn the toggle off and ask again',
  resumeFailed:
    "Couldn't continue the earlier conversation, so this was asked fresh — the AI doesn't remember what came before",
  runFailed: "Couldn't run the AI — check the AI connection in Settings, then ask again",
  runFailedRetry: "Couldn't run the AI — check the AI connection in Settings, then try again",
  runFailedPress: "Couldn't run the AI. Check the AI connection in Settings, then press again",
  filesUnchecked: "Couldn't check the files the AI wrote — check them in your library yourself",
  keptPrevious: "Couldn't get a new answer, so the previous answer was kept",
  saveFailed: "Couldn't save the answer — it may not show after you restart the app",
  noConversation: "That conversation doesn't exist",
  busy: 'A question is already in progress',
  nothingToRegenerate: 'There is no question to answer again',
  filesRemain:
    'Files this answer made still exist — undo them from the card under the answer, then ask for a new answer',
  nothingToCompact: 'There is no conversation to continue yet',
  compactFailed: "Couldn't compact the conversation — you can keep asking as is",
  inline: {
    noSelection: 'Select the text to edit first',
    tooLong: 'The selected text is too long — edit it in parts',
    noInstruction: 'Write how to edit it',
    canceled: 'Stopped editing',
    unreadable: "Couldn't make out the AI's edited text — press again"
  },
  web: {
    tooMany: (n: number): string =>
      `Up to ${n} web ${n === 1 ? 'address is' : 'addresses are'} read at a time — ask about the rest separately`,
    notText:
      "Couldn't read it because the address isn't a web page or text — add PDFs and images to your sources, then ask",
    noText: `Couldn't find text to read at the web address — ${PASTE}`,
    offline: "Couldn't connect to the web address — check the address and your internet connection",
    redirects:
      "Couldn't read it because the web address redirected too many times — ask again with the final address",
    tooBig:
      "Couldn't read it because the web page is too large — copy the part you need and paste it into your question",
    timeout: (seconds: number): string =>
      `Couldn't read it because the web address didn't respond within ${seconds} ${seconds === 1 ? 'second' : 'seconds'} — ask again in a moment`,
    inside: `Addresses on this computer or an internal network aren't read — ${PASTE}`,
    refused: (status: number): string =>
      `Couldn't read the web address (HTTP ${status}) — if the page needs signing in, ${PASTE}`
  },
  otherVaultEditing: 'Text is being edited in another library. Press again when it finishes',
  otherEditing: 'Other text is being edited. Press again when it finishes',
  changesFailed: "Couldn't read what changed"
}
