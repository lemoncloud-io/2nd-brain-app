import type { settings as ko } from '../ko/settings'

export const settings: typeof ko = {
  title: 'Settings',
  description:
    'Change app settings, from AI connection to your library, team repository, display and updates',
  reopenStart: 'Show the first-run guide (Get started) again',
  aiConnect: 'AI connection',
  aiConnectLead: 'Sign in and disconnect here; choose which AI and model to use',
  aiConnectLink: 'in AI settings below',
  aiConnectTail: '.',
  teamRepo: 'Team repository',
  saved: 'Saved',
  save: 'Save',
  aiReadFailed: "Couldn't read the AI settings",
  aiSaveFailed: "Couldn't save the AI settings",
  ai: {
    title: 'AI settings',
    pick: 'AI to use',
    help: {
      claude: 'Runs on your Claude subscription. Sign in and disconnect under AI connection above.',
      codex:
        "Runs on your ChatGPT subscription. Sign in and disconnect under AI connection above. Wiki draft quality was checked with Claude. If you're not sure which to pick, choose Claude."
    },
    saveNote:
      'Your choice is saved right away and used from the next run. Switching AI resets the model to the default.',
    model: 'Model',
    defaultModel: 'Default model (recommended)',
    customModel: (name: string): string => `${name} (entered in Advanced)`,
    codexDefault: 'Uses the Codex default model',
    modelNote:
      "Chat, wiki drafts and AI checks all use this model. To run wiki drafts on a faster model, set it in Advanced at the bottom of Settings. You can also enter a name that isn't in the list there."
  },
  chat: {
    title: 'Chat',
    readFailed: "Couldn't read the chat defaults",
    saveFailed: "Couldn't save the chat defaults",
    modeGroup: 'When the AI uses tools'
  },
  claudeUser: {
    title: 'My Claude settings',
    readFailed: "Couldn't read this setting",
    saveFailed: "Couldn't save this setting",
    label: 'Use them in chat too',
    hint: 'Chat also uses the rules, tone and commands you set up for Claude on this computer. When off, only the settings kept in this library are used. Applies only when Claude answers.'
  },
  advanced: {
    title: 'Advanced',
    hint: 'Custom model · wiki draft model · MCP servers · my Claude settings · advanced display · AI program location · reset layout · diagnostics',
    troubleshoot: 'Troubleshooting',
    cliPath: 'AI program location',
    cliChecking: 'Checking',
    cliMissing: 'Not found'
  },
  customModel: {
    title: 'Custom model',
    hint: (engine: string): string =>
      `Use a model name that isn't in the list for ${engine}. Save it empty to go back to the default model. If the name is wrong, AI features won't run.`,
    label: 'Model name',
    placeholder: 'e.g. claude-opus-5[1m]'
  },
  draftModel: {
    title: 'Wiki draft model',
    hint: (engine: string): string =>
      `Use a different ${engine} model just for making wiki drafts. Save it empty to use the same model as above. If the name is wrong, wiki drafts won't run.`,
    label: 'Wiki draft model name',
    placeholder: 'e.g. haiku'
  },
  anyAi: 'AI',
  badModelName: 'The model name has spaces or special characters. Type the name again',
  budget: {
    title: 'How much chat reads',
    readFailed: "Couldn't read how much chat reads",
    saveFailed: "Couldn't save how much chat reads",
    hint: (step: string): string =>
      `${step} Chat searches your library first and sends the documents it finds along with your question. Applies from your next question.`
  },
  display: {
    title: 'Advanced display',
    showFileExtensions: {
      label: 'Show file types',
      hint: 'The tree shows "notes.md" instead of "notes". You can change the type when renaming.'
    },
    showChatMeters: {
      label: 'Show chat model, AI memory and usage',
      hint: 'Below the chat box you see the model in use, how much of this conversation the AI remembers, and your account usage.'
    }
  },
  panelReset: {
    action: 'Reset layout',
    done: 'Layout reset. The default layout shows the next time you open the app',
    failed: "Couldn't reset the layout"
  },
  update: {
    title: 'App updates',
    restart: 'Restart to use the new version'
  },
  mcp: {
    title: 'MCP servers',
    intro:
      "Outside tools chat can use — small programs that do set jobs for it (the same MCP other apps use). Only servers you turn on are used, from the next question, and never for wiki drafts or checks. Commands run directly on this computer, and environment variables such as access keys stay as is in this computer's settings file. Only add servers you trust. If you're not sure, skip this — the app works fine without it.",
    probeOk: 'Reached it. You can use it from the next question.',
    probeFailed: "Couldn't check the connection",
    listFailed: "Couldn't read the MCP server list",
    saveFailed: "Couldn't save the MCP servers",
    taken: (name: string): string =>
      `${name} already exists. Use another name or remove the existing one first`,
    enable: (name: string): string => `Turn on ${name}`,
    off: 'Off',
    envCount: (n: number): string => ` · ${n} environment ${n === 1 ? 'variable' : 'variables'}`,
    probeLabel: (name: string): string => `Check connection to ${name}`,
    probe: 'Check connection',
    removeLabel: (name: string): string => `Remove ${name}`,
    presetHint:
      "Paste the example from the server's docs as is. After saving, use Check connection on its row to see if it's reachable.",
    presetStdio: 'Fill in a local command example',
    presetStdioTarget: 'npx -y @modelcontextprotocol/server-filesystem /folder-to-share',
    presetHttp: 'Fill in a web address example',
    presetHttpTarget: 'https://example.com/mcp',
    nameLabel: 'Server name',
    namePlaceholder: 'Name (e.g. github)',
    targetLabel: 'Command or address to run',
    targetPlaceholder: 'Command (npx -y @modelcontextprotocol/server-github) or https:// address',
    add: 'Add',
    envSummary: "Environment variables (optional) — when the server's docs ask for an access key",
    envLabel: 'Environment variables',
    envPlaceholder: 'One per line, KEY=value\nGITHUB_PERSONAL_ACCESS_TOKEN=...',
    jsonSummary: 'Paste settings JSON — the "mcpServers" snippet from the server\'s docs, as is',
    jsonLabel: 'MCP settings JSON',
    jsonPlaceholder: '{ "mcpServers": { "name": { "command": "npx", "args": ["-y", "..."] } } }',
    import: 'Import',
    removeTitle: (name: string): string => `Remove the ${name} server?`,
    removeDetail:
      "It's removed from the list right away. To use it again, add it again from scratch. Chat stops using this server from the next question.",
    keep: 'Keep',
    remove: 'Remove'
  }
}
