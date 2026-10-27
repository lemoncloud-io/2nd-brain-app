// 한국어 사전 — 정본. 영역마다 파일 하나, 영어 사전(`../en`)이 같은 모양을 따른다.
// `as const` 를 붙이지 않는다 — 문자열 리터럴 타입이 되면 영어 사전이 같은 한국어를 요구한다.
import { appearance } from './appearance'
import { bases } from './bases'
import { chat } from './chat'
import { chatActions } from './chat-actions'
import { chatService } from './chat-service'
import { chatSession } from './chat-session'
import { chatView } from './chat-view'
import { clipMain } from './clip-main'
import { commands } from './commands'
import { common } from './common'
import { diagnostics } from './diagnostics'
import { doc } from './doc'
import { engineConnect } from './engine-connect'
import { engineFailure } from './engine-failure'
import { engineLog } from './engine-log'
import { engineMain } from './engine-main'
import { errors } from './errors'
import { files } from './files'
import { github } from './github'
import { githubMain } from './github-main'
import { graph } from './graph'
import { ingestMain } from './ingest-main'
import { install } from './install'
import { knowledge } from './knowledge'
import { library } from './library'
import { lintMain } from './lint-main'
import { lintView } from './lint-view'
import { mainErrors } from './main-errors'
import { mcp } from './mcp'
import { noteRun } from './note-run'
import { onboarding } from './onboarding'
import { preview } from './preview'
import { review } from './review'
import { reviewMain } from './review-main'
import { settings } from './settings'
import { shell } from './shell'
import { sourceView } from './source-view'
import { sources } from './sources'
import { start } from './start'
import { sync } from './sync'
import { syncMain } from './sync-main'
import { teamRepo } from './team-repo'
import { today } from './today'
import { tools } from './tools'
import { update } from './update'
import { vaultMain } from './vault-main'
import { vaultSettings } from './vault-settings'
import { vaultSetup } from './vault-setup'
import { vaultTemplates } from './vault-templates'
import { verifyDefect } from './verify-defect'
import { views } from './views'
import { web } from './web'
import { wiki } from './wiki'
import { wikiDoc } from './wiki-doc'
import { wikiMain } from './wiki-main'
import { wikiPanes } from './wiki-panes'

export const ko = {
  appearance,
  bases,
  chat,
  chatActions,
  chatService,
  chatSession,
  chatView,
  clipMain,
  commands,
  common,
  diagnostics,
  doc,
  engineConnect,
  engineFailure,
  engineLog,
  engineMain,
  errors,
  files,
  github,
  githubMain,
  graph,
  ingestMain,
  install,
  knowledge,
  library,
  lintMain,
  lintView,
  mainErrors,
  mcp,
  noteRun,
  onboarding,
  preview,
  review,
  reviewMain,
  settings,
  shell,
  sourceView,
  sources,
  start,
  sync,
  syncMain,
  teamRepo,
  today,
  tools,
  update,
  vaultMain,
  vaultSettings,
  vaultSetup,
  vaultTemplates,
  verifyDefect,
  views,
  web,
  wiki,
  wikiDoc,
  wikiMain,
  wikiPanes
}
