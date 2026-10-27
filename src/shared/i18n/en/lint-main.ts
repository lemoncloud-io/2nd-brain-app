import type { lintMain as ko } from '../ko/lint-main'

export const lintMain: typeof ko = {
  cutOff: "The AI check result was cut off and couldn't be read — check again",
  unreadable: "Couldn't make sense of the AI check result — check again",
  running: 'An AI check is already running'
}
