import { expect, test } from './fixtures'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo, openChatTab, openDoc, revealInTree } from './helpers'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

/** 0.1초짜리 무음 PCM WAV — Chromium 이 코덱 없이 디코드한다 */
const silentWav = (): Buffer => {
  const samples = 4410
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + samples * 2, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(44100, 24)
  header.writeUInt32LE(88200, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(samples * 2, 40)
  return Buffer.concat([header, Buffer.alloc(samples * 2)])
}

test('Sources 탭 — raw·Clippings 트리와 md·txt·이미지·PDF 미리보기', async ({ launch }) => {
  const { page, vaultDir } = await launch('sources-e2e')

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  mkdirSync(join(vaultDir, 'raw', 'papers'), { recursive: true })
  mkdirSync(join(vaultDir, 'Clippings'), { recursive: true })
  writeFileSync(join(vaultDir, 'raw', 'papers', 'note.md'), '# 리서치 노트\n\n본문이다\n')
  writeFileSync(join(vaultDir, 'raw', 'papers', 'pic.png'), PNG_1PX)
  copyFileSync(resolve('test/fixtures/pdf/sample.pdf'), join(vaultDir, 'raw', 'papers', 'doc.pdf'))
  writeFileSync(join(vaultDir, 'Clippings', 'memo.txt'), '그냥 메모 텍스트\n')

  await goTo(page, 'sources')
  // 원본도 파일 트리에 있다
  await expect(await revealInTree(page, 'raw/papers/note.md')).toBeVisible()
  await expect(await revealInTree(page, 'raw/papers/pic.png')).toBeVisible()

  // md 는 리더로 열린다
  await openDoc(page, 'raw/papers/note.md')
  await expect(page.getByTestId('wiki-reader')).toContainText('본문이다')

  // 이미지 미리보기
  await openDoc(page, 'raw/papers/pic.png')
  await expect(page.getByTestId('sources-preview')).toBeVisible()
  await expect(page.getByTestId('sources-image')).toBeVisible()

  // PDF 미리보기 — 워커 로드·첫 페이지 렌더까지 (pdfjs 기본 빌드는 Electron 39 에서 깨진다)
  await openDoc(page, 'raw/papers/doc.pdf')
  await expect(page.getByTestId('sources-pdf')).toContainText('1페이지 중 1페이지')

  // 위키화 대기(Clippings) → txt 미리보기
  await expect(await revealInTree(page, 'Clippings/memo.txt')).toBeVisible()
  await openDoc(page, 'Clippings/memo.txt')
  await expect(page.getByTestId('sources-txt')).toContainText('그냥 메모 텍스트')
})

test('Sources 탭 — 소리 파일은 플레이어로 열리고 큰 영상은 구간으로 받아 온다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('sources-media-e2e')

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  mkdirSync(join(vaultDir, 'raw', 'media'), { recursive: true })
  writeFileSync(join(vaultDir, 'raw', 'media', 'tone.wav'), silentWav())
  // 진짜 영상은 무겁다 — 프로토콜의 구간 전달만 본다(코덱은 기기 몫)
  writeFileSync(join(vaultDir, 'raw', 'media', 'clip.mp4'), Buffer.alloc(25 * 1024 * 1024, 3))

  await goTo(page, 'sources')
  await openDoc(page, 'raw/media/tone.wav')
  await expect(page.getByTestId('sources-audio')).toBeVisible()

  // 20MB 가 넘어도 서브하고, Range 에 206 으로 답한다 — 이게 없으면 영상 탐색이 막힌다
  const ranged = await page.evaluate(async () => {
    const res = await fetch('vault://local/raw/media/clip.mp4', {
      headers: { Range: 'bytes=0-9' }
    })
    return {
      status: res.status,
      contentRange: res.headers.get('content-range'),
      length: (await res.arrayBuffer()).byteLength
    }
  })
  expect(ranged.status).toBe(206)
  expect(ranged.contentRange).toBe(`bytes 0-9/${25 * 1024 * 1024}`)
  expect(ranged.length).toBe(10)
})

test('Sources 탭 — json 은 원문으로, html 은 페이지 모양과 원문을 오간다', async ({ launch }) => {
  const { app, page, vaultDir } = await launch('sources-code-e2e')

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  mkdirSync(join(vaultDir, 'raw', 'data'), { recursive: true })
  writeFileSync(join(vaultDir, 'raw', 'data', 'ok.json'), '{"이름":"레몬","수":3}')
  writeFileSync(join(vaultDir, 'raw', 'data', 'broken.json'), '{이건 json 이 아니다')
  writeFileSync(
    join(vaultDir, 'raw', 'data', 'page.html'),
    '<html><body><h1>보관함 안 글</h1><script>' +
      'const out=(id,t)=>document.body.appendChild(Object.assign(document.createElement("p"),{id,textContent:t}));' +
      'out("ran","스크립트가 돌았다");' +
      'try{parent.document.title;out("parent","열림")}catch(e){out("parent","막힘")}' +
      'out("api",typeof window.api==="undefined"?"없음":"있음");' +
      'fetch("vault://local/raw/data/ok.json").then(()=>out("fetch","열림"),()=>out("fetch","막힘"))' +
      '</script></body></html>'
  )

  await goTo(page, 'sources')

  // json 은 들여쓰기를 다시 매긴 원문으로
  await openDoc(page, 'raw/data/ok.json')
  await expect(page.getByTestId('sources-code')).toContainText('"이름": "레몬"')
  await expect(page.getByTestId('sources-json-invalid')).toHaveCount(0)

  // 깨진 json 은 막다른 길이 아니다 — 원문과 그 사실
  await openDoc(page, 'raw/data/broken.json')
  await expect(page.getByTestId('sources-json-invalid')).toBeVisible()
  await expect(page.getByTestId('sources-code')).toContainText('이건 json 이 아니다')

  // html 은 페이지 모양으로 — 스크립트는 돌지만 앱·보관함의 다른 파일에는 닿지 못한다
  await openDoc(page, 'raw/data/page.html')
  const frame = page.frameLocator('[data-testid="sources-html"]')
  await expect(frame.locator('h1')).toHaveText('보관함 안 글')
  await expect(frame.locator('#ran')).toHaveText('스크립트가 돌았다')
  await expect(frame.locator('#parent')).toHaveText('막힘')
  await expect(frame.locator('#api')).toHaveText('없음')
  await expect(frame.locator('#fetch')).toHaveText('막힘')

  // 브라우저로 넘기기 — html 만 받는다
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    Object.assign(globalThis, { opened })
    shell.openPath = async (path: string) => {
      opened.push(path)
      return ''
    }
  })
  await page.getByTestId('sources-html-browser').click()
  await page.evaluate(() =>
    (window as unknown as { api: { openInBrowser: (rel: string) => unknown } }).api.openInBrowser(
      'raw/data/ok.json'
    )
  )
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened))
    .toEqual([join(vaultDir, 'raw', 'data', 'page.html')])

  // 원문 토글
  await page.getByTestId('sources-html-toggle').click()
  await expect(page.getByTestId('sources-code')).toContainText('<h1>보관함 안 글</h1>')
  await page.getByTestId('sources-html-toggle').click()
  await expect(page.getByTestId('sources-html')).toBeVisible()
})

test('Sources 탭 — csv 는 표로, mdx 는 문서로, yml 은 구문 색으로, jsonl 은 글자로 연다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('sources-formats-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  mkdirSync(join(vaultDir, 'raw', 'data'), { recursive: true })
  writeFileSync(join(vaultDir, 'raw', 'data', 't.csv'), 'name,note\n"Kim, J",hi\nLee,yo\n')
  writeFileSync(
    join(vaultDir, 'raw', 'data', 'doc.mdx'),
    '---\ntitle: 숨는 머리말\n---\n# 매뉴얼\n\n본문 **굵게**\n'
  )
  writeFileSync(join(vaultDir, 'raw', 'data', 'c.yml'), 'name: lemon\n')
  writeFileSync(join(vaultDir, 'raw', 'data', 'log.jsonl'), '{"a":1}\n{"a":2}\n')
  writeFileSync(
    join(vaultDir, 'raw', 'data', 'a.js'),
    'const answer = 42\nfunction hello(name) {\n  return `hi ${name}`\n}\n'
  )
  await goTo(page, 'sources')

  // csv — 첫 줄이 머리, 따옴표 안 쉼표는 칸 하나
  await openDoc(page, 'raw/data/t.csv')
  const table = page.getByTestId('sources-table')
  await expect(table.locator('th')).toHaveText(['name', 'note'])
  await expect(table.locator('tbody tr').first().locator('td')).toHaveText(['Kim, J', 'hi'])
  await expect(page.getByTestId('sources-table-size')).toHaveText('2줄 · 2칸')
  await page.getByTestId('sources-table-toggle').click()
  await expect(page.getByTestId('sources-preview')).toContainText('"Kim, J",hi')

  // mdx — 머리말은 빼고 본문을 그린다
  await openDoc(page, 'raw/data/doc.mdx')
  const doc = page.getByTestId('sources-markdown')
  await expect(doc.locator('h1')).toHaveText('매뉴얼')
  await expect(doc.locator('strong')).toHaveText('굵게')
  await expect(doc).not.toContainText('숨는 머리말')

  // yml — 편집기 계열 읽기 칸(구문 색)
  await openDoc(page, 'raw/data/c.yml')
  await expect(page.getByTestId('sources-code')).toContainText('name: lemon')

  // jsonl — 글자로
  await openDoc(page, 'raw/data/log.jsonl')
  await expect(page.getByTestId('sources-txt')).toContainText('{"a":2}')

  // js — 편집기 계열 읽기 칸에 토큰 색이 입는다
  await openDoc(page, 'raw/data/a.js')
  const js = page.getByTestId('sources-code')
  await expect(js).toContainText('answer')
  expect(await js.locator('.cm-line span[class]').count()).toBeGreaterThan(0)

  // js — 고치고 저장하면 다시 열 때 반영된다
  await page.getByTestId('source-edit').click()
  const editor = page.getByTestId('sources-code-editor')
  await editor.locator('.cm-content').click()
  await page.keyboard.type('\n// e2e 메모')
  await expect(page.getByTestId('source-dirty')).toBeVisible()
  await page.getByTestId('source-save').click()
  await expect(page.getByTestId('source-saved')).toContainText('저장했어요')
  await openDoc(page, 'raw/data/a.js')
  await expect(page.getByTestId('sources-preview')).toContainText('// e2e 메모')
})

test('Sources 탭 — .base 는 뷰 탭 달린 표로 열리고 이름을 누르면 그 문서가 열린다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('sources-base-e2e')

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  const note = (rel: string, front: string, body: string): void => {
    mkdirSync(join(vaultDir, rel, '..'), { recursive: true })
    writeFileSync(join(vaultDir, rel), `---\n${front}\n---\n\n${body}\n`)
  }
  note(
    'projects/hermes/README.md',
    'type: project\nstatus: active',
    '# 헤르메스\n\n돌아가는 일이다'
  )
  note('projects/old/README.md', 'type: project\nstatus: done', '# 끝난 일')
  note('templates/project.md', 'type: project\nstatus: active', '# 양식')
  writeFileSync(
    join(vaultDir, 'projects.base'),
    [
      'filters:',
      '  and:',
      '    - type == "project"',
      `    - '!file.inFolder("templates")'`,
      'formulas:',
      '  project: link(file.path, file.folder.replace(/^.*\\//, ""))',
      'properties:',
      '  formula.project:',
      '    displayName: 프로젝트',
      'views:',
      '  - type: table',
      '    name: Active',
      '    filters:',
      '      and:',
      '        - status != "done"',
      '    order:',
      '      - file.name',
      '      - status',
      '  - type: table',
      '    name: All',
      '    order:',
      '      - file.name',
      '  - type: cards',
      '    name: 카드',
      '  - type: table',
      '    name: 수식',
      '    order:',
      '      - formula.project',
      '      - status',
      '    groupBy:',
      '      property: status',
      '      direction: DESC'
    ].join('\n')
  )

  await goTo(page, 'sources')
  await openDoc(page, 'projects.base')

  // Active 뷰 — 끝난 것과 양식은 빠진다
  await expect(page.getByTestId('base-count')).toHaveText('1개')
  await expect(page.getByTestId('base-table')).toContainText('active')

  // 뷰를 바꾸면 조건도 바뀐다
  await page.getByTestId('base-view-tab').nth(1).click()
  await expect(page.getByTestId('base-count')).toHaveText('2개')

  // 이 앱이 못 읽는 보기는 틀린 행 대신 이유를 보인다
  await page.getByTestId('base-view-tab').nth(2).click()
  await expect(page.getByTestId('base-unsupported')).toContainText('Obsidian')
  await expect(page.getByTestId('base-table')).toHaveCount(0)

  // 수식 뷰 — 파일에 적힌 formulas 를 계산하고 groupBy 로 묶는다
  await page.getByTestId('base-view-tab').nth(3).click()
  await expect(page.getByTestId('base-table')).toContainText('프로젝트')
  await expect(page.getByTestId('base-group').first()).toHaveText('done')
  await expect(page.getByTestId('base-row-open').first()).toHaveText('old')

  // 이름 칸을 누르면 그 문서가 리더로 열린다
  await page.getByTestId('base-view-tab').nth(0).click()
  await page.getByTestId('base-row-open').first().click()
  await expect(page.getByTestId('wiki-reader')).toContainText('돌아가는 일이다')
})

test('자료 탭 클리핑 — URL 을 Clippings 에 저장하면 볼트 안 위치만 보이고 위키화로 이어진다', async ({
  launch,
  serve
}) => {
  const port = await serve((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(
      '<html><head><title>로컬 글</title></head><body><article><h1>로컬 글</h1>' +
        '<p>클리핑으로 모을 본문이다. 위키화 패널로 이어지는지 본다.</p></article></body></html>'
    )
  })
  const { page, vaultDir } = await launch('clip-url-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  await goTo(page, 'sources')
  // 드롭 안내가 받는 형식을 사람 말로 말한다 — 확장자 나열이 아니다
  await expect(page.getByTestId('clip-drop')).toContainText('메모·텍스트와 PDF·한글·오피스 문서')
  await page.getByTestId('clip-url').fill(`http://127.0.0.1:${port}/post`)
  await page.getByTestId('clip-url-button').click()

  const result = page.getByTestId('clip-result')
  await expect(result).toContainText('자료에 담았어요:')
  await expect(result).not.toContainText(vaultDir)

  // 자료 구역이 위키화를 기다리는 수를 센다 — 사이드바 배지가 가리키는 그 수다
  await expect(page.getByTestId('sources-waiting')).toContainText('위키 초안을 기다리는 자료')
  // 넣은 자료가 이름으로 줄 서고, 시작은 옆 칸 위키화 탭 한 곳이 쥔다
  await expect(page.getByTestId('sources-waiting-list')).toContainText('로컬-글')
  await openChatTab(page, 'chat')
  await page.getByTestId('sources-open-ingest').click()
  await expect(page.getByTestId('chat-tab-ingest')).toHaveAttribute('aria-selected', 'true')
  // 앞 단계가 위키화를 이미 시작했다 — 쉬는 칸이면 시작, 도는 칸이면 멈추기 하나만 보인다
  await expect(
    page.getByTestId('ingest-start').or(page.getByTestId('ingest-running'))
  ).toBeVisible()
})

test('채팅에 주소만 붙여 넣으면 자료로 넣기를 권한다 — 넣으면 입력칸이 비고 위키화로 이어진다', async ({
  launch,
  serve
}) => {
  const port = await serve((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(
      '<html><head><title>채팅 글</title></head><body><article><h1>채팅 글</h1>' +
        '<p>채팅 칸에서 주소로 넣는 본문이다.</p></article></body></html>'
    )
  })
  const { app, page, vaultDir } = await launch('chat-url-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  await openChatTab(page, 'chat')

  const url = `http://127.0.0.1:${port}/post`
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), url)
  await page.getByTestId('chat-input').focus()
  await page.keyboard.press('ControlOrMeta+KeyV')
  await expect(page.getByTestId('chat-input')).toHaveValue(url)
  await page.getByTestId('chat-url-clip').click()

  await expect(page.getByTestId('chat-clip-note')).toContainText('자료에 1개 담았어요')
  await expect(page.getByTestId('chat-input')).toHaveValue('')
  await expect(page.getByTestId('chat-url-offer')).toHaveCount(0)
  await expect(page.getByTestId('chat-clip-ingest')).toBeVisible()
})

test('위키화 칸은 수만이 아니라 무엇이 기다리는지 보여 주고, 누르면 그 자료를 읽는다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('ingest-waiting-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'Clippings', '거래처 회의록.md'), '# 거래처 회의록\n\n단가 합의\n')
  writeFileSync(join(vaultDir, 'Clippings', '견적서.txt'), '견적 본문')

  await openChatTab(page, 'ingest')
  const waiting = page.getByTestId('ingest-waiting')
  await expect(waiting.getByTestId('ingest-waiting:Clippings/거래처 회의록.md')).toHaveText(
    /거래처 회의록/
  )
  await expect(waiting.getByTestId('ingest-waiting:Clippings/견적서.txt')).toContainText('TXT')
  await expect(page.getByTestId('ingest-start')).toHaveText('자료 2개로 위키 초안 만들기')

  await waiting.getByTestId('ingest-waiting:Clippings/거래처 회의록.md').click()
  await expect(page.getByTestId('wiki-reader')).toContainText('단가 합의')
})
