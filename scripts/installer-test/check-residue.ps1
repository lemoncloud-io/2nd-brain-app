<#
.SYNOPSIS
  2nd-brain 언인스톨 뒤 Windows 에 남은 것을 센다.

.DESCRIPTION
  build/uninstall-targets.json 의 win 목록(정본)을 하나씩 검사해 남은 경로를 출력하고 개수를 exit code 로 돌려준다.
  마커와 무관하게 목록 전체를 본다 — 언인스톨이 앱 데이터와 함께 마커를 지운 뒤에도 CLI 잔여물을 잡으려면 목록이
  기준이어야 한다. 그래서 원래 자기 CLI 가 있던 PC 에서는 그 경로가 잔여물로 보인다(docs/INSTALL-TEST.md 알려진 잔여물).
  아무것도 지우지 않는다. Node 가 없는 클린 PC 에서 돌리므로 PowerShell 5.1 내장 명령만 쓴다.

.PARAMETER Targets
  uninstall-targets.json 경로. 기본은 이 스크립트 기준 ..\..\build\uninstall-targets.json — 클린 PC 로는 json 을 같이 복사한다.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\installer-test\check-residue.ps1
  echo $LASTEXITCODE   # 0 이면 잔여물 없음. 남은 개수가 exit code, 64 는 스크립트 오류(json 없음·환경변수 비어 있음)
#>
[CmdletBinding()]
param(
  [string]$Targets = ''
)
$ErrorActionPreference = 'Stop'
# 기본값을 param 안에서 계산하지 않는다 — Windows PowerShell 5.1 은 -File 실행에서 param 기본값 평가 시점에 $PSScriptRoot 가
# 비어 있다(CI 35591628073 실측: "Join-Path : Cannot bind argument to parameter 'Path' because it is an empty string").
if (-not $Targets) {
  $Targets = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\..\build\uninstall-targets.json'
}

# 스크립트 오류는 "잔여물 n 개" 와 겹치지 않는 64 로 — 목록이 20 개를 넘지 않는다
$left = @()
try {
  if (-not (Test-Path -LiteralPath $Targets)) { throw "uninstall-targets.json not found: $Targets" }
  # 5.1 은 BOM 없는 UTF-8 을 ANSI 로 읽는다 — 경로는 ASCII 지만 명시한다
  $win = (Get-Content -LiteralPath $Targets -Raw -Encoding UTF8 | ConvertFrom-Json).win

  # 출력 순서는 json 의 키 순서를 따르지만 5.1 이 보장하지는 않는다 — exit code(개수)에는 무관
  foreach ($key in $win.PSObject.Properties.Name) {
    foreach ($raw in $win.$key) {
      $path = [Environment]::ExpandEnvironmentVariables($raw)
      # 확장 안 된 %VAR% 가 남으면 그 변수가 비어 있는 것 — 잘못된 경로를 "없음" 으로 세지 않는다
      if ($path -match '%[^%]+%') { throw "environment variable not set for $raw" }
      # -LiteralPath: 경로의 [ ] 를 와일드카드로 읽지 않는다
      if (Test-Path -LiteralPath $path) { $left += "$path ($key)" }
    }
  }
} catch {
  # Write-Error 는 ErrorActionPreference=Stop 아래에서 종료 오류가 되어 exit 64 에 못 미친다 — stderr 에 직접 쓴다
  $host.UI.WriteErrorLine("check-residue: $_")
  exit 64
}

foreach ($item in $left) { "left: $item" }
if ($left.Count -eq 0) { 'residue: none' }
exit $left.Count
