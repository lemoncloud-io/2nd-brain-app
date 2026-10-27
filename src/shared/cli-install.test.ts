import { describe, expect, it } from 'vitest'
import { cliInstallDisplay, cliInstallEnv, cliInstallRun } from './cli-install'

describe('cliInstallRun', () => {
  it('mac 은 bash -c 로 설치 스크립트 한 줄을 돌린다', () => {
    expect(cliInstallRun('claude', 'darwin', {})).toEqual({
      file: '/bin/bash',
      args: ['-c', 'curl -fsSL https://claude.ai/install.sh | bash']
    })
  })

  // PATH 에서 찾으면 앞쪽에 놓인 다른 powershell.exe 가 뜬다
  it('Windows 는 PowerShell 을 SystemRoot 절대경로로 부르고 실행 정책을 넘긴다', () => {
    const run = cliInstallRun('claude', 'win32', { SystemRoot: 'D:\\Win' })
    expect(run.file).toBe('D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(run.args).toEqual([
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      'irm https://claude.ai/install.ps1 | iex'
    ])
  })

  // 화면용 한 줄은 powershell 호출까지 감싸 있다 — 그대로 -Command 에 넣으면 PowerShell 이 두 번 뜬다
  it('Windows Codex 는 감싼 표시용이 아니라 안쪽 스크립트를 돌린다', () => {
    expect(cliInstallRun('codex', 'win32', {}).args.at(-1)).toBe(
      'irm https://chatgpt.com/codex/install.ps1 | iex'
    )
    expect(cliInstallDisplay('codex', 'win32')).toContain('-ExecutionPolicy ByPass')
  })

  // 벤더 스크립트가 "Start Codex now?" 를 물으면 앱은 답할 수 없다 — 값은 벤더가 파싱하는 1·true·yes 중 하나
  it('Codex 설치기에는 프롬프트를 끄는 환경변수를 얹는다', () => {
    // 벤더가 켜는 값으로 받는 집합(install.sh prompt_yes_no · install.ps1:14) 안에 있어야 한다
    expect(['1', 'true', 'yes']).toContain(cliInstallEnv('codex').CODEX_NON_INTERACTIVE)
    expect(cliInstallEnv('claude')).toEqual({})
  })
})

describe('cliInstallRun variants', () => {
  it('SYSTEMROOT 대문자도 SystemRoot 와 같이 읽는다', () => {
    expect(cliInstallRun('claude', 'win32', { SYSTEMROOT: 'E:\\W' }).file).toBe(
      'E:\\W\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    )
  })

  it('Windows 환경변수가 없으면 C:\\Windows 로 떨어진다', () => {
    expect(cliInstallRun('codex', 'win32', {}).file).toBe(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    )
  })

  it('linux 는 posix 스크립트를 bash -c 로 돌린다', () => {
    expect(cliInstallRun('codex', 'linux', {})).toEqual({
      file: '/bin/bash',
      args: ['-c', 'curl -fsSL https://chatgpt.com/codex/install.sh | sh']
    })
  })

  it('표시용 한 줄은 플랫폼 표를 그대로 보여 준다', () => {
    expect(cliInstallDisplay('claude', 'darwin')).toBe(
      'curl -fsSL https://claude.ai/install.sh | bash'
    )
    expect(cliInstallDisplay('claude', 'win32')).toBe('irm https://claude.ai/install.ps1 | iex')
  })
})
