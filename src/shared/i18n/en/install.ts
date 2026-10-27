import type { install as ko } from '../ko/install'

export const install: typeof ko = {
  claudeAccount: 'Claude subscription',
  claudePlan: 'Claude paid plan (Pro or higher)',
  codexAccount: 'ChatGPT subscription',
  codexPlan: 'ChatGPT paid plan (Plus or higher)',
  paste:
    "Copy the line below, paste it into the terminal (Mac ⌘V · Windows Ctrl+V) and press Enter. If it asks for your computer's password, enter it and press Enter",
  trust:
    'If an unfamiliar address makes you hesitate: check that it matches the one shown here and that the copy button pasted all of it',
  terminalMac:
    'Press Spotlight (⌘ Space), type "Terminal" and press Enter. A black window means it worked',
  terminalWindows:
    'Open the Start menu, type "PowerShell" and press Enter. A blue window means it worked',
  afterInstallSymptom: "Installation finished, but this screen doesn't move on",
  afterInstallFix: (engine: string): string =>
    `Close the terminal, open a new one, type "${engine} --version" and press Enter. If you see a number (e.g. 2.1.270), click "Check again" below. If it still doesn't move on, quit and reopen this app`,
  truncatedSymptom: 'The command is long and the line looks cut off',
  truncatedFix: "Use the copy button so the whole line goes in. Don't retype it by hand",
  irmFix:
    'Open the blue window (PowerShell), not the black one (Command Prompt). Type "PowerShell" in the Start menu and press Enter to open it again',
  syntaxErrorSymptom: "syntax error near unexpected token '<' or 403",
  syntaxErrorFix:
    'An error page came back instead of the installer. Run the same line again in a minute or two, or use another install method from the docs below'
}
