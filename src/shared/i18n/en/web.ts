import type { web as ko } from '../ko/web'

export const web: typeof ko = {
  address: 'Address',
  addressPlaceholder: 'Web page address',
  empty: 'Enter an address and press Enter',
  toolbar: 'Web page',
  newTab: 'New web page',
  openBlank: 'Open a web page',
  back: 'Back',
  forward: 'Forward',
  reload: 'Reload',
  stop: 'Stop loading',
  loading: 'Loading',
  openOutside: 'Open in browser',
  retry: 'Open again',
  clip: 'Save',
  clipHint: 'Save the page you see to your sources — including text you see only when signed in',
  clipping: 'Saving…',
  clipped: 'Saved to your sources',
  openClipped: 'Open',
  clipFailed: "Couldn't save this page",
  badScheme: "This address can't be opened inside the app",
  badAddress: 'Check the address — enter it like example.com',
  crashed: 'The page stopped responding — open it again',
  loadFailed:
    "Couldn't open the page — check the address and your internet connection, then open it again"
}
