import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  AppApi,
  ChatEvent,
  EngineEvent,
  SyncState,
  UpdateState,
  WebShortcut,
  WebState
} from '../shared/ipc-contract'
import { APP_CHANNELS } from '../shared/ipc-contract'
import { themeFromArgv } from '../shared/theme'
import { languageFromArgv, type Language } from '../shared/language'

const api: AppApi = {
  getAppInfo: () => ipcRenderer.invoke(APP_CHANNELS.getAppInfo),
  closeWindow: () => ipcRenderer.invoke(APP_CHANNELS.closeWindow),
  onCloseCurrentTab: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on(APP_CHANNELS.closeCurrentTab, handler)
    return () => ipcRenderer.removeListener(APP_CHANNELS.closeCurrentTab, handler)
  },
  getUpdateState: () => ipcRenderer.invoke(APP_CHANNELS.getUpdateState),
  installUpdate: () => ipcRenderer.invoke(APP_CHANNELS.installUpdate),
  checkUpdate: () => ipcRenderer.invoke(APP_CHANNELS.checkUpdate),
  onUpdateChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, state: UpdateState): void => listener(state)
    ipcRenderer.on(APP_CHANNELS.updateChanged, handler)
    return () => ipcRenderer.removeListener(APP_CHANNELS.updateChanged, handler)
  },
  setTheme: (theme) => ipcRenderer.invoke(APP_CHANNELS.setTheme, theme),
  openInObsidian: (rel) => ipcRenderer.invoke(APP_CHANNELS.openInObsidian, rel),
  initialTheme: () => themeFromArgv(process.argv),
  initialLanguage: () => languageFromArgv(process.argv),
  getLanguage: () => ipcRenderer.invoke(APP_CHANNELS.getLanguage),
  setLanguage: (language) => ipcRenderer.invoke(APP_CHANNELS.setLanguage, language),
  onLanguageChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, language: Language): void => listener(language)
    ipcRenderer.on(APP_CHANNELS.languageChanged, handler)
    return () => ipcRenderer.removeListener(APP_CHANNELS.languageChanged, handler)
  },
  startEngineLogin: () => ipcRenderer.invoke(APP_CHANNELS.startEngineLogin),
  installEngine: () => ipcRenderer.invoke(APP_CHANNELS.installEngine),
  onInstallEvent: (listener) => {
    const handler = (_event: IpcRendererEvent, line: string): void => listener(line)
    ipcRenderer.on(APP_CHANNELS.installEvent, handler)
    return () => ipcRenderer.removeListener(APP_CHANNELS.installEvent, handler)
  },
  logoutEngine: () => ipcRenderer.invoke(APP_CHANNELS.logoutEngine),
  getVaultStatus: () => ipcRenderer.invoke(APP_CHANNELS.getVaultStatus),
  createVault: (template) => ipcRenderer.invoke(APP_CHANNELS.createVault, template),
  createStarterVault: (opts) => ipcRenderer.invoke(APP_CHANNELS.createStarterVault, opts),
  getJourney: () => ipcRenderer.invoke(APP_CHANNELS.getJourney),
  getVaultChanges: () => ipcRenderer.invoke(APP_CHANNELS.getVaultChanges),
  restoreVault: (confirmed) => ipcRenderer.invoke(APP_CHANNELS.restoreVault, confirmed),
  getRemote: () => ipcRenderer.invoke(APP_CHANNELS.getRemote),
  connectRemote: (url) => ipcRenderer.invoke(APP_CHANNELS.connectRemote, url),
  pushRemote: () => ipcRenderer.invoke(APP_CHANNELS.pushRemote),
  disconnectRemote: () => ipcRenderer.invoke(APP_CHANNELS.disconnectRemote),
  createTeamRepo: (org, name) => ipcRenderer.invoke(APP_CHANNELS.createTeamRepo, org, name),
  inviteMember: (username) => ipcRenderer.invoke(APP_CHANNELS.inviteMember, username),
  joinTeamVault: (url, invitationId) =>
    ipcRenderer.invoke(APP_CHANNELS.joinTeamVault, url, invitationId),
  openVault: () => ipcRenderer.invoke(APP_CHANNELS.openVault),
  openVaultInNewWindow: () => ipcRenderer.invoke(APP_CHANNELS.openVaultInNewWindow),
  openVaultRecent: (dir) => ipcRenderer.invoke(APP_CHANNELS.openVaultRecent, dir),
  adoptVault: () => ipcRenderer.invoke(APP_CHANNELS.adoptVault),
  adoptPreview: () => ipcRenderer.invoke(APP_CHANNELS.adoptPreview),
  importVault: (url) => ipcRenderer.invoke(APP_CHANNELS.importVault, url),
  syncVault: () => ipcRenderer.invoke(APP_CHANNELS.syncVault),
  shareEdits: (include) => ipcRenderer.invoke(APP_CHANNELS.shareEdits, include ?? []),
  getSyncState: () => ipcRenderer.invoke(APP_CHANNELS.getSyncState),
  readConflict: (path) => ipcRenderer.invoke(APP_CHANNELS.readConflict, path),
  githubAuthState: () => ipcRenderer.invoke(APP_CHANNELS.githubAuthState),
  githubAuthStart: () => ipcRenderer.invoke(APP_CHANNELS.githubAuthStart),
  githubAuthFinish: () => ipcRenderer.invoke(APP_CHANNELS.githubAuthFinish),
  githubSignOut: () => ipcRenderer.invoke(APP_CHANNELS.githubSignOut),
  githubOrgs: () => ipcRenderer.invoke(APP_CHANNELS.githubOrgs),
  githubTeamVaults: () => ipcRenderer.invoke(APP_CHANNELS.githubTeamVaults),
  resolveConflict: (path, pick) => ipcRenderer.invoke(APP_CHANNELS.resolveConflict, path, pick),
  onSyncChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, state: SyncState): void => listener(state)
    ipcRenderer.on(APP_CHANNELS.syncChanged, handler)
    return () => ipcRenderer.removeListener(APP_CHANNELS.syncChanged, handler)
  },
  clipFile: (srcPath) => ipcRenderer.invoke(APP_CHANNELS.clipFile, srcPath),
  clipUrl: (url) => ipcRenderer.invoke(APP_CHANNELS.clipUrl, url),
  webEnsure: (tabId, url) => ipcRenderer.invoke(APP_CHANNELS.webEnsure, tabId, url),
  webNavigate: (tabId, url) => ipcRenderer.invoke(APP_CHANNELS.webNavigate, tabId, url),
  webSetBounds: (tabId, rect) => ipcRenderer.invoke(APP_CHANNELS.webSetBounds, tabId, rect),
  webClose: (tabId) => ipcRenderer.invoke(APP_CHANNELS.webClose, tabId),
  webBack: (tabId) => ipcRenderer.invoke(APP_CHANNELS.webBack, tabId),
  webForward: (tabId) => ipcRenderer.invoke(APP_CHANNELS.webForward, tabId),
  webReload: (tabId) => ipcRenderer.invoke(APP_CHANNELS.webReload, tabId),
  webStop: (tabId) => ipcRenderer.invoke(APP_CHANNELS.webStop, tabId),
  webClip: (tabId) => ipcRenderer.invoke(APP_CHANNELS.webClip, tabId),
  webCapture: (tabId) => ipcRenderer.invoke(APP_CHANNELS.webCapture, tabId),
  onWebOpenRequest: (listener) => {
    const handler = (_event: IpcRendererEvent, url: string): void => listener(url)
    ipcRenderer.on(APP_CHANNELS.webOpenRequest, handler)
    return () => ipcRenderer.removeListener(APP_CHANNELS.webOpenRequest, handler)
  },
  onWebShortcut: (listener) => {
    const handler = (_event: IpcRendererEvent, key: WebShortcut): void => listener(key)
    ipcRenderer.on(APP_CHANNELS.webShortcut, handler)
    return () => ipcRenderer.removeListener(APP_CHANNELS.webShortcut, handler)
  },
  onWebState: (listener) => {
    const handler = (_event: IpcRendererEvent, state: WebState): void => listener(state)
    ipcRenderer.on(APP_CHANNELS.webState, handler)
    return () => ipcRenderer.removeListener(APP_CHANNELS.webState, handler)
  },
  startIngest: (opts) => ipcRenderer.invoke(APP_CHANNELS.startIngest, opts),
  cancelIngest: () => ipcRenderer.invoke(APP_CHANNELS.cancelIngest),
  getIngestQueue: () => ipcRenderer.invoke(APP_CHANNELS.ingestQueue),
  onIngestEvent: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: EngineEvent): void => listener(payload)
    ipcRenderer.on(APP_CHANNELS.ingestEvent, handler)
    return () => ipcRenderer.removeListener(APP_CHANNELS.ingestEvent, handler)
  },
  onActivityChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, running: boolean): void => listener(running)
    ipcRenderer.on(APP_CHANNELS.activityChanged, handler)
    return () => ipcRenderer.removeListener(APP_CHANNELS.activityChanged, handler)
  },
  onWikiChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, rels: string[]): void => listener(rels)
    ipcRenderer.on(APP_CHANNELS.wikiChanged, handler)
    return () => ipcRenderer.removeListener(APP_CHANNELS.wikiChanged, handler)
  },
  listReview: () => ipcRenderer.invoke(APP_CHANNELS.listReview),
  finalizeReview: (rejectedPaths) => ipcRenderer.invoke(APP_CHANNELS.finalizeReview, rejectedPaths),
  undoMerge: (branch) => ipcRenderer.invoke(APP_CHANNELS.undoMerge, branch),
  listWikiPages: () => ipcRenderer.invoke(APP_CHANNELS.listWikiPages),
  listGraphPages: () => ipcRenderer.invoke(APP_CHANNELS.listGraphPages),
  listVaultDocs: () => ipcRenderer.invoke(APP_CHANNELS.listVaultDocs),
  listVaultTree: () => ipcRenderer.invoke(APP_CHANNELS.listVaultTree),
  createVaultNote: (folder, name) => ipcRenderer.invoke(APP_CHANNELS.createVaultNote, folder, name),
  renameVaultEntry: (rel, name, nameHasExt) =>
    ipcRenderer.invoke(APP_CHANNELS.renameVaultEntry, rel, name, nameHasExt),
  moveVaultEntry: (rel, toFolder) => ipcRenderer.invoke(APP_CHANNELS.moveVaultEntry, rel, toFolder),
  trashVaultEntry: (rel) => ipcRenderer.invoke(APP_CHANNELS.trashVaultEntry, rel),
  createVaultFolder: (parent, name) =>
    ipcRenderer.invoke(APP_CHANNELS.createVaultFolder, parent, name),
  readBase: (rel) => ipcRenderer.invoke(APP_CHANNELS.readBase, rel),
  readWikiPage: (rel) => ipcRenderer.invoke(APP_CHANNELS.readWikiPage, rel),
  checkboxCounts: (rels) => ipcRenderer.invoke(APP_CHANNELS.checkboxCounts, rels),
  writeWikiPage: (rel, text, baseHash) =>
    ipcRenderer.invoke(APP_CHANNELS.writeWikiPage, rel, text, baseHash),
  writeTextFile: (rel, text, baseHash) =>
    ipcRenderer.invoke(APP_CHANNELS.writeTextFile, rel, text, baseHash),
  docHistory: (rel) => ipcRenderer.invoke(APP_CHANNELS.docHistory, rel),
  docAt: (rel, rev) => ipcRenderer.invoke(APP_CHANNELS.docAt, rel, rev),
  saveAttachment: (name, bytes) => ipcRenderer.invoke(APP_CHANNELS.saveAttachment, name, bytes),
  listTemplates: () => ipcRenderer.invoke(APP_CHANNELS.listTemplates),
  listTags: () => ipcRenderer.invoke(APP_CHANNELS.listTags),
  unlinkedMentions: (rel) => ipcRenderer.invoke(APP_CHANNELS.unlinkedMentions, rel),
  listBookmarks: () => ipcRenderer.invoke(APP_CHANNELS.listBookmarks),
  toggleBookmark: (rel) => ipcRenderer.invoke(APP_CHANNELS.toggleBookmark, rel),
  getEditLock: () => ipcRenderer.invoke(APP_CHANNELS.getEditLock),
  openExternal: (url) => ipcRenderer.invoke(APP_CHANNELS.openExternal, url),
  searchWiki: (query, limit) => ipcRenderer.invoke(APP_CHANNELS.searchWiki, query, limit),
  lintWiki: () => ipcRenderer.invoke(APP_CHANNELS.lintWiki),
  lintAiPages: () => ipcRenderer.invoke(APP_CHANNELS.lintAiPages),
  lintAiRun: () => ipcRenderer.invoke(APP_CHANNELS.lintAiRun),
  lintAiCancel: () => ipcRenderer.invoke(APP_CHANNELS.lintAiCancel),
  mergePropose: (relA, relB) => ipcRenderer.invoke(APP_CHANNELS.mergePropose, relA, relB),
  mergeCancel: () => ipcRenderer.invoke(APP_CHANNELS.mergeCancel),
  mergeApply: (input) => ipcRenderer.invoke(APP_CHANNELS.mergeApply, input),
  mergeUndo: (commit) => ipcRenderer.invoke(APP_CHANNELS.mergeUndo, commit),
  onLintAiEvent: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: EngineEvent): void => listener(payload)
    ipcRenderer.on(APP_CHANNELS.lintAiEvent, handler)
    return () => ipcRenderer.removeListener(APP_CHANNELS.lintAiEvent, handler)
  },
  askChat: (question, conversationId, context) =>
    ipcRenderer.invoke(APP_CHANNELS.askChat, question, conversationId, context),
  stopChat: (conversationId) => ipcRenderer.invoke(APP_CHANNELS.stopChat, conversationId),
  listChatSkills: () => ipcRenderer.invoke(APP_CHANNELS.listChatSkills),
  compactChat: (conversationId) => ipcRenderer.invoke(APP_CHANNELS.compactChat, conversationId),
  regenerateChat: (conversationId, context) =>
    ipcRenderer.invoke(APP_CHANNELS.regenerateChat, conversationId, context),
  answerChatPermission: (conversationId, requestId, answer) =>
    ipcRenderer.invoke(APP_CHANNELS.answerChatPermission, conversationId, requestId, answer),
  listChats: () => ipcRenderer.invoke(APP_CHANNELS.listChats),
  loadChat: (conversationId) => ipcRenderer.invoke(APP_CHANNELS.loadChat, conversationId),
  renameChat: (conversationId, title) =>
    ipcRenderer.invoke(APP_CHANNELS.renameChat, conversationId, title),
  saveChatToWiki: (payload) => ipcRenderer.invoke(APP_CHANNELS.saveChatToWiki, payload),
  saveChatAnswer: (payload) => ipcRenderer.invoke(APP_CHANNELS.saveChatAnswer, payload),
  undoNoteChange: (conversationId, changeId) =>
    ipcRenderer.invoke(APP_CHANNELS.undoNoteChange, conversationId, changeId),
  changeReview: (conversationId, changeId, rel) =>
    ipcRenderer.invoke(APP_CHANNELS.changeReview, conversationId, changeId, rel),
  inlineEdit: (request) => ipcRenderer.invoke(APP_CHANNELS.inlineEdit, request),
  cancelInlineEdit: () => ipcRenderer.invoke(APP_CHANNELS.cancelInlineEdit),
  rejectChangeHunk: (conversationId, changeId, rel, index, hash) =>
    ipcRenderer.invoke(APP_CHANNELS.rejectChangeHunk, conversationId, changeId, rel, index, hash),
  removeChat: (conversationId) => ipcRenderer.invoke(APP_CHANNELS.removeChat, conversationId),
  docChanges: (rel, since) => ipcRenderer.invoke(APP_CHANNELS.docChanges, rel, since),
  onChatEvent: (listener) => {
    const handler = (_event: IpcRendererEvent, conversationId: string, payload: ChatEvent): void =>
      listener(conversationId, payload)
    ipcRenderer.on(APP_CHANNELS.chatEvent, handler)
    return () => ipcRenderer.removeListener(APP_CHANNELS.chatEvent, handler)
  },
  revealInFinder: (rel) => ipcRenderer.invoke(APP_CHANNELS.revealInFinder, rel),
  openInBrowser: (rel) => ipcRenderer.invoke(APP_CHANNELS.openInBrowser, rel),
  filePathForFile: (file) => webUtils.getPathForFile(file),
  getEngineSettings: () => ipcRenderer.invoke(APP_CHANNELS.getEngineSettings),
  getChatDefaults: () => ipcRenderer.invoke(APP_CHANNELS.getChatDefaults),
  getOnboardingPurpose: () => ipcRenderer.invoke(APP_CHANNELS.getOnboardingPurpose),
  setOnboardingPurpose: (text) => ipcRenderer.invoke(APP_CHANNELS.setOnboardingPurpose, text),
  getUiPrefs: () => ipcRenderer.invoke(APP_CHANNELS.getUiPrefs),
  getAccountUsage: (fresh) => ipcRenderer.invoke(APP_CHANNELS.getAccountUsage, fresh === true),
  setUiPrefs: (prefs) => ipcRenderer.invoke(APP_CHANNELS.setUiPrefs, prefs),
  getEngineStatus: () => ipcRenderer.invoke(APP_CHANNELS.getEngineStatus),
  listReviewItems: () => ipcRenderer.invoke(APP_CHANNELS.listReviewItems),
  dismissReviewItem: (id) => ipcRenderer.invoke(APP_CHANNELS.dismissReviewItem, id),
  listDismissedReviewItems: () => ipcRenderer.invoke(APP_CHANNELS.listDismissedReviewItems),
  restoreReviewItem: (id) => ipcRenderer.invoke(APP_CHANNELS.restoreReviewItem, id),
  setEngineSettings: (settings) => ipcRenderer.invoke(APP_CHANNELS.setEngineSettings, settings),
  setChatDefaults: (defaults) => ipcRenderer.invoke(APP_CHANNELS.setChatDefaults, defaults),
  getMcpServers: () => ipcRenderer.invoke(APP_CHANNELS.getMcpServers),
  setMcpServers: (servers) => ipcRenderer.invoke(APP_CHANNELS.setMcpServers, servers),
  probeMcpServer: (name) => ipcRenderer.invoke(APP_CHANNELS.probeMcpServer, name),
  reportError: (report) => ipcRenderer.invoke(APP_CHANNELS.reportError, report),
  openLogsFolder: () => ipcRenderer.invoke(APP_CHANNELS.openLogsFolder),
  exportDiagnostics: () => ipcRenderer.invoke(APP_CHANNELS.exportDiagnostics),
  getDiagnosticsState: () => ipcRenderer.invoke(APP_CHANNELS.getDiagnosticsState),
  setDeveloperMode: (on) => ipcRenderer.invoke(APP_CHANNELS.setDeveloperMode, on),
  openDevTools: () => ipcRenderer.invoke(APP_CHANNELS.openDevTools),
  getProcessMetrics: () => ipcRenderer.invoke(APP_CHANNELS.getProcessMetrics),
  startTrace: () => ipcRenderer.invoke(APP_CHANNELS.startTrace),
  stopTrace: () => ipcRenderer.invoke(APP_CHANNELS.stopTrace)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
