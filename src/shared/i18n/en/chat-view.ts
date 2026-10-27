import type { chatView as ko } from '../ko/chat-view'

export const chatView: typeof ko = {
  tabs: {
    chat: { label: 'Chat', back: 'Back to chat' },
    peek: { label: 'Pages used', back: 'Back to pages used' },
    ingest: { label: 'Wiki draft', back: 'Back to wiki draft' },
    history: { label: 'History', back: 'Back to history' }
  },
  tabsLabel: 'Chat pane',
  dot: { running: 'In progress', answering: 'Answer coming in', unseen: 'New answer' },
  collapse: 'Collapse chat pane',
  newConversation: 'New conversation',
  history: 'Past conversations',
  memoryHint:
    'How much of what the AI can remember at once this conversation uses. Compact it when it fills up',
  memory: (percent: number): string => `Memory ${percent}%`,
  usageHint: 'Account usage — share used; in brackets, time until it refills',
  usageReread: 'Check usage again',
  permission: { fold: 'Collapse', more: 'Show all', allow: 'Allow', deny: 'Deny' },
  hunk: {
    done: "You've looked at every edit",
    line: (n: number): string => `Line ${n}`,
    keep: 'Keep',
    undo: 'Undo',
    removed: 'Removed line',
    added: 'Added line',
    readFailed: "Couldn't read the edits",
    undoFailed: "Couldn't undo it",
    loading: 'Reading the edits…'
  },
  change: {
    label: 'Files this answer changed',
    created: 'Created',
    edited: 'Edited',
    state: {
      undone: 'Undone',
      kept: 'Not undone because it was edited again afterwards'
    },
    reviewClose: 'Close review',
    review: 'Review',
    marks: 'Changes',
    open: 'Open',
    interrupted: 'The last answer was cut off — these are the files written up to then',
    undoing: 'Undoing…',
    undo: 'Undo',
    undone: 'What this answer wrote has been undone',
    nothingUndone: 'Nothing was undone — everything was edited again afterwards',
    pruned: 'The record needed to undo this was cleared'
  },
  list: {
    title: 'Conversations',
    empty: 'No conversations yet',
    renameLabel: 'Conversation name',
    answering: 'Answering',
    confirmDelete: (title: string): string => `Confirm deleting ${title}`,
    delete: 'Delete',
    cancelDelete: 'Cancel delete',
    cancel: 'Cancel',
    rename: (title: string): string => `Rename ${title}`,
    remove: (title: string): string => `Delete ${title}`
  },
  chips: {
    openTitle: (rel: string): string =>
      `Attaches the text of ${rel}, the document you're viewing, to this question`,
    remove: (title: string): string => `Detach ${title}`,
    commands: 'Skills',
    mentions: 'Documents to attach',
    skillsLoading: 'Loading skills…'
  },
  thread: {
    slashWait: (command: string): string =>
      `You can send ${command} when the answer finishes — it's kept in the input box`,
    adding: (n: number): string => `Adding ${n}…`,
    fileFailed: (name: string): string => `Couldn't add ${name}`,
    added: (n: number): string =>
      `Added ${n} to sources — continue with the Make a wiki draft button below`,
    fetchingUrl: 'Fetching the page at that address…',
    urlFailed: "Couldn't add that address"
  },
  messages: {
    scroll: 'Conversation scroll',
    log: 'Conversation',
    welcome: 'What shall we do today?',
    welcomeBody:
      'Ask in words for notes and plans and they get written to files — undo is on the card under the answer. The documents the AI read are shown under each answer. To ask about a specific document, attach it with @.',
    edit: 'Edit and ask again',
    editHint: 'Puts it in the input box so you can edit and ask again',
    copy: 'Copy',
    regenerateHint: 'Deletes this answer and answers the same question again',
    regenerate: 'Answer again',
    save: 'Save answer',
    saved: (label: string): string => `Saved to ${label} · Open`,
    toBottomUnread: 'See new answer — jump to bottom',
    /** 글 없이 멈춘 답 — 저장 값(STOPPED_MARK)을 화면 언어로 */
    stopped: '(stopped)',
    toBottom: 'Jump to bottom'
  },
  images: {
    typeError: 'Only PNG, JPEG, GIF and WebP images can be attached',
    sizeError: 'The image is too large to attach — crop it smaller and paste again',
    countError: (max: number): string => `You can attach up to ${max} images per question`,
    readError: "Couldn't read the image — paste it again",
    pasted: (n: number): string => `Pasted image ${n}`,
    remove: (n: number): string => `Remove pasted image ${n}`,
    count: (n: number): string => (n === 1 ? '1 image' : `${n} images`),
    zoom: (alt: string): string => `View ${alt} larger`,
    close: 'Close'
  },
  composer: {
    compactPreview: (total: number, asked: number, answered: number): string =>
      `Summarizes the ${total} ${total === 1 ? 'message' : 'messages'} so far (${asked} ${asked === 1 ? 'question' : 'questions'} · ${answered} ${answered === 1 ? 'answer' : 'answers'}) to remember. After summarizing, the AI can't reread the earlier text — that's why it can't be undone.`,
    closeNotice: 'Close notice',
    tooLong:
      'This conversation is getting long — if the topic changed, start a new conversation. Answers will be more accurate',
    urlOffer:
      'You can add the page at the address you pasted to your sources — and make a wiki draft from it later',
    urlClip: 'Add to sources',
    urlAsk: 'Just ask',
    ingest: 'Make a wiki draft',
    retry: 'Ask again',
    assistCount: (n: number): string =>
      `${n} ${n === 1 ? 'option' : 'options'} — choose with the up and down arrows`,
    placeholderRunning: 'Answering… press Enter to stop',
    placeholder:
      "Today's note, sources, questions — write freely (@ attach a document, / commands)",
    input: 'Question input',
    attach: 'Add sources',
    attachHint:
      'Adds writing, documents and notes to your sources — you can also drag files into the input box',
    stop: 'Stop',
    stopHint: 'Stop the answer',
    send: 'Ask',
    sendHint: 'Send (Enter · Shift+Enter for a new line)',
    compactHint: 'Compact conversation — the AI summarizes the earlier part to remember it',
    compact: 'Compact',
    compactTitle: 'Compact this conversation?',
    compactDetail:
      "The AI briefly summarizes the earlier part of this conversation to remember it. Open documents and other conversations aren't touched. Each summary uses a little of your subscription and can't be undone. The conversation on screen stays as is.",
    keep: 'Keep',
    compactConfirm: 'Compact'
  },
  session: {
    listFailed: "Couldn't read the conversation list",
    compactedBy: (before: number, after: number): string => ` — down from ${before}% to ${after}%`,
    compacted: (howMuch: string): string =>
      `Compacted the conversation${howMuch}. The AI remembers a summary of the earlier part, and the conversation above stays as is`,
    compactedByAi:
      'The AI replaced the earlier part with a summary — the conversation above stays as is',
    answerFailed: "Couldn't get an answer",
    rereadFailed: "Couldn't reload the conversation",
    openFailed: "Couldn't open the conversation",
    compactBusy: "It's still answering. Press again after the answer finishes",
    compactFailed: "Couldn't compact the conversation",
    askFailed: "Couldn't send the question",
    regenerateFailed: "Couldn't get a new answer",
    stopFailed: "Couldn't stop the answer",
    saved: 'Saved as a note',
    saveFailed: "Couldn't save the answer",
    undoFailed: "Couldn't undo it",
    renameFailed: "Couldn't rename the conversation",
    removeFailed: "Couldn't delete the conversation",
    permissionFailed: "Couldn't send your answer"
  }
}
