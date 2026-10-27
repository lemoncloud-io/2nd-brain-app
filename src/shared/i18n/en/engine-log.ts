import type { engineLog as ko } from '../ko/engine-log'

export const engineLog: typeof ko = {
  tool: {
    Read: 'Reading',
    Write: 'Writing',
    Edit: 'Editing',
    MultiEdit: 'Editing',
    NotebookEdit: 'Editing',
    Glob: 'Finding files',
    Grep: 'Searching contents',
    WebSearch: 'Searching the web',
    WebFetch: 'Reading a web page'
  },
  unknownTool: 'Using an AI tool',
  write: 'Writing',
  commit: 'Recording the changes',
  verify: 'Checking library rules',
  patch: 'Writing files',
  branch: 'Setting up a separate workspace for the wiki draft',
  inspect: 'Checking what changed',
  readFile: 'Reading a file',
  command: 'Running a command',
  error: 'Something went wrong during the task',
  canceled: 'Canceled the task',
  done: 'Finished the task',
  failed: "Couldn't finish the task"
}
