// e2e 공용 — 격리된 userData 로 빌드된 앱을 띄우고, 폴더 선택 대화상자를 지정 폴더로 고정한다.
import { expect } from '@playwright/test'
import {
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page
} from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { runDir } from './run-tree'

/**
 * 대면 뜨는 설명이 가로로 읽히는지 본다. 담는 칸이 좁으면 폭을 주지 않은 상자가 min-content 까지
 * 줄어 한국어가 한 글자씩 세로로 쌓인다. 임계를 픽셀로 잡으면 폰트·패딩이 바뀔 때마다 깨지므로
 * 기하로 본다 — 가로로 읽히는 상자는 높이보다 넓다.
 */
export const expectReadableTooltip = async (hint: Locator): Promise<void> => {
  const box = await hint.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.height).toBeLessThan(box!.width)
  // `max-w-80` = 320px. 이 상한이 사라지면 긴 문구가 창을 가로지른다
  expect(box!.width).toBeLessThanOrEqual(320)
}

export const MAIN_ENTRY = join(__dirname, '../out/main/index.js')

/** 엔진 CLI 기본값 — 로그인된 가짜. 없으면 개발 PC 에 깔린 진짜 claude 를 잡아, CLI 가 없는 CI 러너에서만 깨진다 */
const DEFAULT_CLAUDE = join(__dirname, '../test/fixtures/fake-claude/logged-in/claude')

export interface LaunchOptions {
  /** 대화상자가 돌려줄 폴더. 없으면 root/vault 를 빈 폴더로 만든다 */
  dialogDir?: string
  /** 앱 프로세스 cwd — 기본은 Playwright 의 cwd(레포 루트) */
  cwd?: string
  env?: Record<string, string>
  /** 이전 실행의 userData — 재시작 뒤 설정이 남는지 볼 때 */
  userData?: string
}

export interface Launched {
  app: ElectronApplication
  page: Page
  root: string
  userData: string
  vaultDir: string
}

/**
 * 앱 하나를 격리된 userData 로 띄운다. 임시 폴더는 이번 실행의 그루 아래에 판다(`run-tree.ts`).
 * 뒷정리는 부르는 쪽이 아니라 `fixtures.ts` 의 `launch` 가 한다 — 실패·시간 초과 뒤에도 닿는 자리다.
 */
export const launchApp = async (prefix: string, opts: LaunchOptions = {}): Promise<Launched> => {
  const root = mkdtempSync(join(runDir(), `${prefix}-`))
  const userData = opts.userData ?? join(root, 'user-data')
  const vaultDir = opts.dialogDir ?? join(root, 'vault')
  if (!opts.userData) mkdirSync(userData)
  if (!opts.dialogDir) mkdirSync(vaultDir)

  // E2E_APP_EXECUTABLE 이 있으면 패키징된 앱 실행 파일을 띄운다 — electron-builder 의 files 제외가 런타임 모듈을 빼먹지 않았는지 본다
  const packaged = process.env.E2E_APP_EXECUTABLE
  const app = await electron.launch({
    ...(packaged ? { executablePath: packaged, args: [] } : { args: [MAIN_ENTRY] }),
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    env: {
      ...process.env,
      CLAUDE_CLI_PATH: DEFAULT_CLAUDE,
      SECOND_BRAIN_USER_DATA: userData,
      // 첫 실행 보관함의 기본 자리(문서 폴더) — 개발 PC 의 진짜 문서 폴더에 쓰지 않는다
      SECOND_BRAIN_VAULT_PARENT: join(root, 'documents'),
      ...opts.env
    }
  })
  await app.evaluate(({ dialog }, dir) => {
    Object.assign(dialog, {
      showOpenDialog: async () => ({ canceled: false, filePaths: [dir] })
    })
  }, vaultDir)
  const page = await app.firstWindow()
  return { app, page, root, userData, vaultDir }
}

/*
 * 화면 이동은 전부 이 함수들을 지난다 — 셸 구조(사이드바·문서 자리·채팅 칸)가 바뀌면 여기만 고친다.
 * 이동 버튼의 존재·상태 자체를 단언하는 spec 만 testid 를 직접 쓴다.
 */
type Clickable = Pick<Page, 'getByTestId'>

/** 지식 관리 한 페이지 안의 구역 — 옛 뷰 이름이 여기로 접혔다 */
const KNOWLEDGE_SECTION: Record<string, string> = {
  sources: 'sources',
  search: 'search',
  graph: 'graph',
  lint: 'lint',
  review: 'review',
  knowledge: 'sources'
}

/**
 * 중앙으로 이동한다. 새 셸의 자리는 셋뿐이라(`doc`·`knowledge`·`settings`, 그리고 `start`)
 * 옛 뷰 이름은 그 자리로 옮겨 준다: 자료·검색·그래프·점검·승인은 지식 관리의 구역,
 * 위키는 문서 자리, 채팅·위키화는 옆 칸의 탭이다.
 */
export const goTo = async (page: Clickable, viewId: string): Promise<void> => {
  if (viewId === 'chat') {
    await openChatTab(page, 'chat')
    return
  }
  if (viewId === 'ingest') {
    await openChatTab(page, viewId)
    return
  }
  if (viewId === 'wiki' || viewId === 'home') {
    // 문서 복귀 줄은 문서 자리가 아닐 때만 있다 — 이미 문서면 누를 것이 없고, 없는데도 안 보이면 갇힌 것이다
    if ((await page.getByTestId('nav-back-doc').count()) > 0) {
      await page.getByTestId('nav-back-doc').click()
    }
    return
  }
  const section = KNOWLEDGE_SECTION[viewId]
  if (section) {
    await page.getByTestId('nav-knowledge').click()
    // 보관함이 아직 없으면 구역 탭 대신 가드가 서 있다 — 그때는 거기까지가 이동이다
    const opened = (page as Page).getByTestId('knowledge-view')
    await opened
      .or((page as Page).getByTestId('setup-gate:knowledge'))
      .first()
      .waitFor()
    if (await opened.isVisible()) await page.getByTestId(`knowledge-tab-${section}`).click()
    return
  }
  await page.getByTestId(`nav-${viewId}`).click()
}

/**
 * 첫 실행 시작하기의 첫 질문 — 답을 적어 다음으로 가거나(answer), 나중에 적기로 넘긴다(null).
 * 시작하기를 끝낸 적 없는 앱은 질문부터 묻는다 — AI 연결·보관함 단계를 보려면 여기를 지난다
 */
export const answerPurpose = async (page: Page, answer: string | null): Promise<void> => {
  if (answer === null) {
    await page.getByTestId('purpose-skip').click()
  } else {
    await page.getByTestId('purpose-answer').fill(answer)
    await page.getByTestId('purpose-save').click()
  }
  await expect(page.getByTestId('start-step-purpose')).toHaveAttribute('data-state', 'done')
}

/**
 * 설정 맨 아래 '고급' 을 펴 둔다 — 켜 둔 MCP 서버가 있으면 화면이 스스로 펴므로, 읽고 누르는 사이
 * 그 펼침이 끼어들 수 있다. 펼쳐진 것이 보일 때까지 다시 본다
 */
export const openAdvancedSettings = async (page: Page): Promise<void> => {
  const toggle = page.getByTestId('settings-advanced-toggle')
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 500 })
  }).toPass()
}

/** 오른쪽 채팅 칸의 탭을 고른다 — 접혀 있으면 먼저 편다 */
export const openChatTab = async (page: Clickable, tab: string): Promise<void> => {
  const pane = (page as Page).getByTestId('chat-pane')
  // 아직 안 그려진 칸을 "접혀 있다" 로 읽으면 토글이 거꾸로 돈다 — 붙을 때까지 기다린 뒤 본다
  await pane.waitFor({ state: 'attached' })
  if ((await pane.isVisible()) === false) await page.getByTestId('toggle-chat').click()
  await page.getByTestId(`chat-tab-${tab}`).click()
}

/** 채팅 칸 머리글의 "지난 대화" 목록을 펴 둔다 — 대화를 고르면 다시 접힌다 */
export const openConversations = async (page: Page): Promise<void> => {
  if ((await page.getByTestId('chat-conv-panel').isVisible()) === false) {
    await page.getByTestId('chat-history').click()
  }
}

/** 파일 트리에서 그 파일을 드러낸다 — 감싼 폴더를 위에서부터 편다 */
export const revealInTree = async (page: Page, rel: string): Promise<Locator> => {
  const parts = rel.split('/').slice(0, -1)
  for (let i = 1; i <= parts.length; i += 1) {
    const dir = page.getByTestId(`tree-dir:${parts.slice(0, i).join('/')}`)
    if ((await dir.getAttribute('aria-expanded')) !== 'true') await dir.click()
  }
  return page.getByTestId(`tree-file:${rel}`)
}

/** 파일 트리에서 파일을 연다 — md 는 리더, 그 밖은 자료 미리보기 */
export const openDoc = async (page: Page, rel: string): Promise<void> =>
  (await revealInTree(page, rel)).click()

/** 새 탭을 웹 탭으로 열고 주소로 이동한다 — 빈 탭의 `웹 페이지 열기` 를 지난다 */
export const openWebTab = async (page: Page, url: string): Promise<void> => {
  await page.getByTestId('doc-tab-new').click()
  await page.getByTestId('blank-web').click()
  const address = page.getByTestId('web-address')
  await expect(address).toBeFocused()
  await address.fill(url)
  await address.press('Enter')
}

/** main 쪽에서 본 웹 view 들 — Playwright 는 WebContentsView 를 page 로 잡지 않을 수 있어 main 으로 잰다 */
export const webViews = (app: ElectronApplication): Promise<{ url: string; visible: boolean }[]> =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().flatMap((win) =>
      win.contentView.children
        .filter((child): child is Electron.WebContentsView => 'webContents' in child)
        .map((view) => ({ url: view.webContents.getURL(), visible: view.getVisible() }))
    )
  )

/** 보이는 웹 view 안의 요소를 누른다 — 사용자 동작으로 쳐서(새 창 열기가 막히지 않게) 페이지 스크립트로 누른다 */
export const webClick = (app: ElectronApplication, selector: string): Promise<void> =>
  app.evaluate(async ({ BrowserWindow }, sel) => {
    const view = BrowserWindow.getAllWindows()
      .flatMap((win) => win.contentView.children)
      .filter((child): child is Electron.WebContentsView => 'webContents' in child)
      .find((child) => child.getVisible())
    if (!view) throw new Error('보이는 웹 view 가 없다')
    await view.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(sel)}).click()`,
      true
    )
  }, selector)
