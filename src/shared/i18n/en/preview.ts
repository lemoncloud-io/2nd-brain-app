import type { preview as ko } from '../ko/preview'

export const preview: typeof ko = {
  loading: 'Loading…',
  officeNote: 'Shows only the text and images — check the original layout in the default app',
  openDefault: 'Open in default app',
  zoomFit: 'Fit',
  zoomActual: 'Actual size',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomTools: 'Image zoom — ⌘(Ctrl) + wheel, ⌘= ⌘- ⌘0',
  officeTooLarge: "Documents over 20MB aren't previewed here — open it in the default app",
  officeNotFound: "Couldn't find the document — it may have been moved or deleted",
  officeUnreadable: "Couldn't read this document — open it in the default app"
}
