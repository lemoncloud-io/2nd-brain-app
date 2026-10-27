import type { mcp as ko } from '../ko/mcp'

export const mcp: typeof ko = {
  unreadable: "Couldn't read the server settings",
  badName: 'Use up to 40 English letters, digits, - or _ for the name',
  noCommand: 'Enter the command to run',
  badUrl: 'The address must start with http:// or https://',
  notJson: "Couldn't read it as JSON. Paste the settings snippet from the docs as is",
  noServersKey: 'Settings for each server name must be under "mcpServers"',
  empty: 'There are no servers'
}
