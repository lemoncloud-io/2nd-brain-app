import type { clipMain as ko } from '../ko/clip-main'

export const clipMain: typeof ko = {
  noFilePath: 'No file path to add',
  noUrl: 'No address to add',
  pageUnreadable: "Couldn't save this page — press again once the page has fully loaded",
  pageSaving: 'Saving this page…',
  oldXls:
    'The old Excel format (.xls) can\'t be added — in Excel, use "Save As → .xlsx", then add it',
  oldDoc:
    'The old Word format (.doc) can\'t be added — in Word, use "Save As → .docx", then add it',
  oldPpt:
    'The old PowerPoint format (.ppt) can\'t be added — in PowerPoint, use "Save As → .pptx", then add it',
  hwpUnreadable: "Couldn't open the Hangul document",
  wordUnreadable: "Couldn't open the Word document",
  pptUnreadable: "Couldn't open the PowerPoint file",
  damaged: (head: string): string => `${head} — it's password-protected or damaged`,
  unsupported: (ext: string, list: string): string =>
    `${ext} files can't be added — only ${list} can be added`,
  noExtension: 'Extensionless',
  goneAfterDrop: "Couldn't open the file — check whether it was deleted after you dropped it",
  tooBig: 'The file is too big — up to 200MB can be added',
  fileUnreadable: "Couldn't open the file — add it again",
  pdfUnreadable: "Couldn't open the PDF — it's password-protected or damaged",
  pdfNoText:
    "Couldn't find any text in this PDF — convert scanned image PDFs to text, then add them",
  docImagesOnly:
    "Couldn't find any text in this document — it's mostly images. Type out the text in the images and add that",
  docNoText: "Couldn't find any text in this document — it's empty or the text is only in images",
  xlsxUnreadable: "Couldn't open the Excel file — it's password-protected or damaged",
  xlsxEmpty: "Couldn't find any text in this Excel file — every sheet is empty",
  badFileName: "That file name can't be used — rename it and add it again",
  badTitle: "That file name can't be used — change the title and add it again",
  otherVault:
    "This answer came from another library, so it isn't saved here — open that library, then save",
  ingestRunning: 'A wiki draft is in progress — save after it finishes',
  badQuestion: "That file name can't be used — change the question and save it again",
  pageTooBig: (size: number): string => `The page is bigger than ${size}MB, so it wasn't added`,
  notWebAddress: "That isn't a web page address — paste an address that starts with https://",
  silent: "The page didn't respond",
  redirects:
    "The address redirects too many times — paste the final address from your browser's address bar",
  timeout: 'No response within 30 seconds — paste it again in a moment',
  unreachable: "Couldn't connect to the page — check the address and your internet connection",
  httpFailed: (status: number): string =>
    `Couldn't get the page (HTTP ${status}) — check that the address is right and that the page doesn't need a sign-in`,
  notText: (type: string): string =>
    `That address isn't a web page or text (${type}) — download PDFs and add them as files`,
  unknownType: 'unknown type',
  zipTooLarge:
    'The document is too large once unpacked — split it into several files and add those',
  hwp3: "The Hangul 3.0 format can't be read — save it as HWPX in Hangul, then add it"
}
