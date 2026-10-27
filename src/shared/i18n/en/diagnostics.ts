import type { diagnostics as ko } from '../ko/diagnostics'

export const diagnostics: typeof ko = {
  uncaughtTitle: 'Something unexpected went wrong in the app',
  rendererGoneTitle: 'The window stopped responding',
  rendererGoneDetail:
    'Reopen it to pick up where you left off. If it keeps happening, export diagnostics and send the file to the team that gave you the app.',
  reopen: 'Reopen',
  openLogs: 'Open logs folder',
  closeWindow: 'Close window',
  crashTitle: 'Something went wrong while drawing this screen',
  crashBody:
    'Reopening may fix it. If it keeps happening, export diagnostics and send the file to the team that gave you the app.',
  openLogsFailed: "Couldn't open the logs folder",
  title: 'Diagnostics',
  hint: 'Saves the diagnostic logs and app details as one file. If something goes wrong, send this file to the team that gave you the app. The logs may include parts of your vault notes.',
  exportDiagnostics: 'Export diagnostics',
  exportTitle: 'Save diagnostics',
  exportFileName: (stamp: string): string => `2nd-brain-diagnostics-${stamp}.zip`,
  exportDone: (name: string): string => `Saved as ${name}`,
  exportFailed: "Couldn't export diagnostics",
  developerMode: 'Developer mode',
  developerModeHint:
    'Keeps detailed logs and turns on developer tools, process usage and performance recording. Turn it on only while tracking down a problem.',
  developerModeFailed: "Couldn't change developer mode",
  openDevTools: 'Open developer tools',
  devToolsFailed: "Couldn't open developer tools",
  processes: 'Processes',
  refresh: 'Refresh',
  metricsFailed: "Couldn't read process usage",
  colType: 'Type',
  colName: 'Name',
  colCpu: 'CPU',
  colMemory: 'Memory',
  memoryMB: (mb: number): string => `${mb} MB`,
  traceStart: 'Start performance recording',
  traceStop: 'Stop recording',
  traceRecording: (elapsed: string): string => `Recording · ${elapsed}`,
  traceHint:
    "Do the slow thing once, then stop. It stops on its own after 5 minutes. The last 3 recordings stay in the logs folder and aren't included in diagnostics — they may contain addresses of web pages you opened, so pick them yourself when sending.",
  traceFailed: "Couldn't record performance",
  developerModeConfirmTitle: 'Turn on developer mode?',
  developerModeConfirmDetail:
    "This is for the team that gave you the app to track down problems. If anyone asks you to paste something into the developer tools, don't — it could hand over your vault and accounts.",
  developerModeConfirm: 'Turn on',
  cancel: 'Cancel',
  stateFailed: "Couldn't read developer mode"
}
