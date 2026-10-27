import type { commands as ko } from '../ko/commands'

export const commands: typeof ko = {
  palette: 'Find and open a page',
  paletteCommands: 'Command palette',
  today: "Open today's note",
  randomPage: 'Open a random wiki page',
  ask: 'Ask',
  chatToggle: 'Show or hide chat',
  find: 'Find in page',
  back: 'Back',
  forward: 'Forward',
  tabNew: 'New tab',
  noteNew: 'New tab',
  tabClose: 'Close this tab',
  tabPrev: 'Tab on the left',
  tabNext: 'Tab on the right',
  tabN: (n: number): string => `Go to tab ${n}`,
  tabLast: 'Go to last tab'
}
