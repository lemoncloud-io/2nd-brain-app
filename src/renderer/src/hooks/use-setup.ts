import { createContext, useContext } from 'react'
import type { SetupState } from './use-setup-state'

const noop = (): void => {}

// SetupProvider(components/setup-gate.tsx) 가 값을 채운다. Provider 밖 기본값은 "확인 중"
export const SetupContext = createContext<SetupState>({
  vault: 'checking',
  engine: 'checking',
  engineKind: 'claude',
  engineStatus: null,
  journey: null,
  remote: null,
  remoteKnown: false,
  github: null,
  sync: {
    received: 0,
    conflicts: [],
    at: null,
    error: null,
    running: false,
    ahead: 0,
    aheadFiles: [],
    newDocs: [],
    behind: 0,
    shared: null,
    skipped: null,
    held: null,
    via: null
  },
  error: null,
  refresh: noop,
  refreshJourney: noop,
  receiveTeamChanges: noop,
  refreshGithub: noop
})

export const useSetup = (): SetupState => useContext(SetupContext)
