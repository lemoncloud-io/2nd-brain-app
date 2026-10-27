// electron-builder afterPack — mac 빌드를 ad-hoc 서명한다. 비서명 빌드(기본)는 이것으로 끝이고,
// 릴리스 CI 가 Developer ID 를 주면 electron-builder 가 afterPack 뒤에 그 위로 다시 서명한다
// (app-builder-lib platformPackager: afterPack → doSignAfterPack).
// arm64 는 서명이 전무하면 실행되지 않는다. `mac.identity: '-'` 는 쓸 수 없다 —
// electron-builder 가 qualifier 를 키체인 줄에 `includes` 로 대조해서
// (app-builder-lib/out/codeSign/macCodeSign.js) 이름에 하이픈이 든 실제 인증서가 잡힌다.
import { execFileSync } from 'node:child_process'
import { lstatSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

/**
 * dugite 의 git-core 는 내장 명령(git-add 등 140여 개)이 `git` 과 같은 실행 파일이다. 받은 tar 에서는 `git` 을
 * 가리키는 링크지만, 패키지 관리자가 복사로 풀면 3.4MB 짜리가 하나하나 실려 앱이 500MB 넘게 커진다.
 * 서명 전에 `git` 과 내용이 같은 파일을 다시 링크로 바꾼다 — git 은 argv[0] 이름으로 내장 명령을 고른다
 */
export const linkGitBuiltins = (app) => {
  const core = join(
    app,
    'Contents/Resources/app.asar.unpacked/node_modules/dugite/git/libexec/git-core'
  )
  const git = readFileSync(join(core, 'git'))
  let linked = 0
  for (const name of readdirSync(core)) {
    if (name === 'git') continue
    const path = join(core, name)
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.size !== git.length) continue
    if (!readFileSync(path).equals(git)) continue
    rmSync(path)
    symlinkSync('git', path)
    linked += 1
  }
  console.log(`  • after-pack: git-core ${linked} files linked to git`)
}

export default async function afterPack(context) {
  const platform = context.electronPlatformName
  if (platform !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  linkGitBuiltins(app)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  // nested 실행파일(asarUnpack 의 dugite git)까지 유효한지 — 깨진 서명으로 dmg 가 나가지 않게
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
}
