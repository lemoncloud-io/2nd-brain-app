import type { EngineKind, EngineSettings } from '../engine-settings'

export const APP_CHANNELS_ENGINE = {
  startEngineLogin: 'engine:start-login',
  installEngine: 'engine:install',
  installEvent: 'engine:install-event',
  logoutEngine: 'engine:logout',
  getEngineSettings: 'engine:get-settings',
  getEngineStatus: 'engine:get-status',
  setEngineSettings: 'engine:set-settings'
} as const

export type ClaudeCliInfo = { path: string; version: string } | { missing: true; reason: string }

/**
 * 로그인 상태. `unknown` 은 "물어봤지만 대답을 못 알아들었다" — 미로그인과 구별해야 한다.
 * 둘을 합치면 로그인 버튼만 보이고, 그 버튼이 통하지 않는 설치본에서 사용자가 영영 빠져나오지 못한다.
 */
export type AuthState = { loggedIn: boolean; email?: string; authMethod?: string; unknown?: true }

export interface ClaudeStatus {
  cli: ClaudeCliInfo
  auth: AuthState
}

/** 설정에서 고른 엔진 CLI 의 설치·로그인 상태 (슬라이스 10) */
export type EngineStatus = { engine: EngineKind; cli: ClaudeCliInfo; auth: AuthState }

/**
 * 앱이 엔진 CLI 를 직접 설치한 결과. exit = 설치기가 실패로 끝났거나(detail 은 stderr 마지막 줄) 설치 기록을
 * 남길 수 없어 돌리지 않음(detail 은 그 오류),
 * not-found = 설치기는 성공했는데 앱이 CLI 를 못 찾음, cancelled = 앱이 꺼지며 끊김.
 */
export type InstallResult =
  | { ok: true; version: string }
  | { ok: false; reason: 'exit' | 'timeout' | 'not-found' | 'cancelled'; detail: string }

/**
 * 엔진이 스스로 알리는 형편 — 어떤 모델로 돌고 있고 대화가 얼마나 찼나.
 * claude 는 채우고 codex 는 보내지 않는다. 모르는 값은 꾸며내지 않고 null 이다
 * (없는 수를 띄우면 그 수를 믿고 대화를 버리거나 붙든다).
 */
export type EngineUsage = {
  /** 실제로 돈 모델 이름 — 설정에서 고른 별명이 아니라 CLI 가 해석한 값 */
  model: string | null
  /** 이번 턴이 쓴 컨텍스트 비율(0~100). 창 크기를 모르면 null */
  contextPercent: number | null
}

/** 위키화 엔진 진행 이벤트 — Claude·Codex 공통 (설계 § 5). */
export type EngineEvent =
  | { type: 'session'; id: string }
  | { type: 'usage'; usage: EngineUsage }
  /** 앞부분이 요약으로 바뀌었다 — 이 줄이 와야 실제로 가벼워진 것이다 */
  | { type: 'compacted' }
  /** 앱이 알리는 단계 전환(팀 받기·엔진 확인·AI 작업) — 엔진이 아니라 main 이 낸다 */
  | {
      type: 'phase'
      label: string
      /**
       * 위키 초안 진행 — 초안을 마친 자료 수/전체·지금까지 나온 페이지 초안 수.
       * 초안 호출은 도구 없이 돌아 읽기·쓰기 이벤트로는 셀 수 없다 — main 이 센 수를 싣는다
       */
      progress?: { done: number; total: number; pages: number }
    }
  | { type: 'text'; text: string }
  /** 모델의 생각 블록(슬라이스 13) — 문구가 있을 때만 온다 */
  | { type: 'thinking'; text: string }
  | { type: 'tool'; name: string; target: string }
  | { type: 'file-change'; path: string }
  /** 엔진이 이 도구를 써도 되는지 묻는다 — `Engine.respond(id, …)` 로 답할 때까지 실행이 기다린다 */
  | {
      type: 'permission'
      id: string
      tool: string
      target: string
      /** CLI 가 제안한 허용 규칙 내용(셸은 `git status *` 꼴) — "이 대화에서 계속 허용" 의 범위 */
      rule?: string
    }
  | { type: 'error'; message: string }
  | { type: 'done'; ok: boolean; canceled: boolean }

export interface AppApiEngine {
  /** 설정에서 고른 엔진(Claude·Codex)의 브라우저 로그인을 띄운다. 끝났는지는 getEngineStatus 로 다시 묻는다 */
  startEngineLogin(): Promise<void>
  /** 설정에서 고른 엔진의 CLI 를 앱이 직접 설치한다 — 끝날 때까지 기다린다. 진행 줄은 onInstallEvent 로 온다 */
  installEngine(): Promise<InstallResult>
  /** 설치기가 내는 최근 출력 한 줄 */
  onInstallEvent(listener: (line: string) => void): () => void
  /** 이 컴퓨터에서 엔진 로그인을 끊는다. 위키와 자료는 건드리지 않는다 */
  logoutEngine(): Promise<EngineStatus>
  /** 설정에서 고른 엔진 CLI 의 설치·로그인 상태 — 탭 게이트가 쓴다 */
  getEngineStatus(): Promise<EngineStatus>
  /** 엔진·모델 하나 설정 — 옛 용도별 models 는 채팅 값을 이어받는다(shared/engine-settings.ts) */
  getEngineSettings(): Promise<EngineSettings>
  /** 정규화해 저장하고 저장된 값을 돌려준다 — 쓸 수 없는 모델 이름은 빠진다 */
  setEngineSettings(settings: EngineSettings): Promise<EngineSettings>
}
