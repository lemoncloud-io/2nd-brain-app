import { APP_CHANNELS_APP, type AppApiApp } from './ipc/app'
import { APP_CHANNELS_CHAT, type AppApiChat } from './ipc/chat'
import { APP_CHANNELS_CLIP_INGEST, type AppApiClipIngest } from './ipc/clip-ingest'
import { APP_CHANNELS_DIAGNOSTICS, type AppApiDiagnostics } from './ipc/diagnostics'
import { APP_CHANNELS_ENGINE, type AppApiEngine } from './ipc/engine'
import { APP_CHANNELS_GITHUB, type AppApiGithub } from './ipc/github'
import { APP_CHANNELS_LINT, type AppApiLint } from './ipc/lint'
import { APP_CHANNELS_REVIEW, type AppApiReview } from './ipc/review'
import { APP_CHANNELS_SETTINGS, type AppApiSettings } from './ipc/settings'
import { APP_CHANNELS_SYNC, type AppApiSync } from './ipc/sync'
import { APP_CHANNELS_VAULT, type AppApiVault } from './ipc/vault'
import { APP_CHANNELS_WEB, type AppApiWeb } from './ipc/web'
import { APP_CHANNELS_WIKI, type AppApiWiki } from './ipc/wiki'

export * from './ipc/app'
export * from './ipc/chat'
export * from './ipc/clip-ingest'
export * from './ipc/diagnostics'
export * from './ipc/engine'
export * from './ipc/github'
export * from './ipc/lint'
export * from './ipc/review'
export * from './ipc/settings'
export * from './ipc/sync'
export * from './ipc/vault'
export * from './ipc/web'
export * from './ipc/wiki'
export type { ThemeSetting } from './theme'

export const APP_CHANNELS = {
  ...APP_CHANNELS_APP,
  ...APP_CHANNELS_ENGINE,
  ...APP_CHANNELS_VAULT,
  ...APP_CHANNELS_SYNC,
  ...APP_CHANNELS_GITHUB,
  ...APP_CHANNELS_CLIP_INGEST,
  ...APP_CHANNELS_REVIEW,
  ...APP_CHANNELS_WIKI,
  ...APP_CHANNELS_CHAT,
  ...APP_CHANNELS_LINT,
  ...APP_CHANNELS_SETTINGS,
  ...APP_CHANNELS_WEB,
  ...APP_CHANNELS_DIAGNOSTICS
} as const

/**
 * main↔renderer 계약. preload·handlers·renderer가 같은 타입을 쓴다.
 * renderer는 `window.api`(preload typed bridge)만 사용한다.
 */
export type AppApi = AppApiApp &
  AppApiEngine &
  AppApiVault &
  AppApiSync &
  AppApiGithub &
  AppApiClipIngest &
  AppApiReview &
  AppApiWiki &
  AppApiChat &
  AppApiLint &
  AppApiSettings &
  AppApiWeb &
  AppApiDiagnostics
