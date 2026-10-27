// build/uninstall-targets.json(정본) ↔ 그 목록을 리터럴로 옮겨 적은 스크립트들의 대조.
// 한쪽만 고치면 red — 경로 하나가 정본에서 빠지거나 스크립트에서 빠지면 언인스톨과 잔여물 검사가 서로 다른 것을 본다.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string): string => readFileSync(resolve(path), 'utf8')
const targets = JSON.parse(read('build/uninstall-targets.json')) as {
  mac: Record<string, string[]>
  win: Record<string, string[]>
}
const command = read('build/uninstall-mac.command')
const nsh = read('build/installer.nsh')
const ps1 = read('scripts/installer-test/check-residue.ps1')
const builder = read('electron-builder.yml')
const pkg = JSON.parse(read('package.json')) as { name: string }

const APP_NAME = '2nd-brain'
const PACKAGE_NAME = pkg.name
const APP_ID = 'io.lemoncloud.2nd-brain-desktop'
const MARKER_KEYS = ['claude', 'claude.config', 'codex', 'codex.config']

/** 주석 줄을 뺀 코드만 — 주석은 ".pending 은 읽지 않는다" 를 설명하려고 그 단어를 쓴다 */
const codeOnly = (text: string, comment: '#' | ';'): string =>
  text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith(comment))
    .join('\n')

describe('uninstall-targets.json 정본', () => {
  it('mac·win 키 집합이 같고 마커 키는 <engine> · <engine>.config 뿐이다', () => {
    expect(Object.keys(targets.mac)).toEqual(['always', ...MARKER_KEYS])
    expect(Object.keys(targets.win)).toEqual(['always', ...MARKER_KEYS])
  })

  it('앱 상수(package name · productName · appId)가 정본과 electron-builder.yml 에서 같다', () => {
    expect(builder).toContain(`appId: ${APP_ID}`)
    expect(builder).toContain(`productName: ${APP_NAME}`)
    expect(targets.mac.always[0]).toBe(`/Applications/${APP_NAME}.app`)
    expect(targets.mac.always[1]).toBe(`~/Library/Application Support/${PACKAGE_NAME}`)
    expect(targets.win.always[0]).toBe(`%LOCALAPPDATA%\\Programs\\${PACKAGE_NAME}`)
    expect(targets.win.always[1]).toBe(`%APPDATA%\\${PACKAGE_NAME}`)
  })
})

describe('build/uninstall-mac.command ↔ 정본 mac', () => {
  it('상수 세 개가 정본의 값이다', () => {
    expect(command).toContain(`APP_NAME='${APP_NAME}'`)
    expect(command).toContain(`PACKAGE_NAME='${PACKAGE_NAME}'`)
    expect(command).toContain(`APP_ID='${APP_ID}'`)
  })

  /** 정본 경로를 스크립트가 쓰는 변수 표기로 — 스크립트는 $HOME·$PACKAGE_NAME·$APP_ID·$APPLICATIONS 로 적는다 */
  const asScript = (path: string): string =>
    path
      .replace(`/Applications/${APP_NAME}.app`, '$APPLICATIONS/$APP_NAME.app')
      .replace(`~/Library/Application Support/${PACKAGE_NAME}`, '$USER_DATA')
      .replace(/^~/, '$HOME')
      .replaceAll(APP_ID, '$APP_ID')

  it.each(Object.entries(targets.mac))('%s 배열이 정본과 같은 순서·같은 경로다', (key, paths) => {
    const name = key.replace('.', '_')
    const block = command.match(new RegExp(`^${name}=\\(\\n((?:  ".*"\\n)+)\\)`, 'm'))
    expect(block, `${name}=( … ) 블록`).not.toBeNull()
    const literals = block![1]
      .trim()
      .split('\n')
      .map((line) => line.trim().slice(1, -1))
    const expected = paths
      .map(asScript)
      .map((p) => (p === '$APPLICATIONS/$APP_NAME.app' ? '$APP' : p))
    expect(literals).toEqual(expected)
  })

  it('마커는 정본 키의 정확한 이름으로만 읽고 .pending 은 코드에 나오지 않는다', () => {
    const reads = [...command.matchAll(/has_marker ([\w.]+)/g)].map((m) => m[1]).sort()
    expect(reads).toEqual([...MARKER_KEYS].sort())
    expect(codeOnly(command, '#')).not.toContain('.pending')
    expect(codeOnly(command, '#')).not.toMatch(/MARKERS"?\/\*/)
  })
})

describe('build/installer.nsh ↔ 정본 win', () => {
  /** %VAR% → NSIS 상수 */
  const asNsis = (path: string): string =>
    path
      .replace('%USERPROFILE%', '$PROFILE')
      .replace('%LOCALAPPDATA%', '$LOCALAPPDATA')
      .replace('%APPDATA%', '$APPDATA')

  it('설치 폴더와 앱 데이터는 템플릿이 지운다 — 그 설정이 켜져 있고, 나머지 always 는 nsh 가 지운다', () => {
    expect(builder).toContain('deleteAppDataOnUninstall: true')
    const [installDir, appData, ...rest] = targets.win.always
    expect(installDir).toBe(`%LOCALAPPDATA%\\Programs\\${PACKAGE_NAME}`)
    // 마커 경로가 앱 데이터 아래다 — 템플릿이 지우기 전에 읽는다는 전제의 근거
    expect(nsh).toContain(`"${asNsis(appData)}\\installed-cli\\`)
    for (const path of rest) expect(nsh).toContain(`"${asNsis(path)}"`)
  })

  it.each(MARKER_KEYS)('%s 경로가 전부 nsh 에 있고 정본과 같은 순서로 지운다', (key) => {
    const positions = targets.win[key].map((path) => {
      const at = nsh.indexOf(`"${asNsis(path)}"`)
      expect(at, path).toBeGreaterThan(-1)
      return at
    })
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('nsh 가 지우는 경로는 전부 정본에 있다 — 정본에서만 빼면 red', () => {
    // Delete·RMDir 의 모든 플래그 변형 + removeTree. 매크로 본문의 "${path}" 는 자리표시자라 뺀다
    const deletes = [...nsh.matchAll(/(?:removeTree|Delete|RMDir)(?: \/\w+)* "([^"]+)"/g)]
      .map((m) => m[1])
      .filter((path) => !path.includes('${'))
    const known = Object.values(targets.win).flat().map(asNsis)
    expect(deletes.length).toBeGreaterThan(0)
    for (const path of deletes) expect(known, path).toContain(path)
  })

  it('마커는 정본 키의 정확한 이름으로만 읽고 .pending 은 코드에 나오지 않는다', () => {
    const reads = [...nsh.matchAll(/installed-cli\\([^"\\]+)"/g)].map((m) => m[1]).sort()
    expect(reads).toEqual([...MARKER_KEYS].sort())
    expect(codeOnly(nsh, ';')).not.toContain('.pending')
    expect(nsh).not.toContain('installed-cli\\*')
  })
})

describe('scripts/installer-test/check-residue.ps1', () => {
  it('정본 json 의 win 목록을 읽는다 — 리터럴 사본이 없다', () => {
    expect(ps1).toContain('uninstall-targets.json')
    expect(ps1).toContain('.win')
    expect(ps1).toContain('ExpandEnvironmentVariables')
    expect(ps1).not.toContain('.pending')
    for (const paths of Object.values(targets.win)) {
      for (const path of paths) expect(ps1).not.toContain(path)
    }
  })
})
