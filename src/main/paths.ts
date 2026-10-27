// 번들 리소스 위치(vault-kit) — 패키징된 앱은 electron-builder extraResources(`to: <name>`), 개발·테스트는 레포의 resources/<name>.
import { join, resolve } from 'node:path'

export type BundledResource = 'vault-kit'

export const bundledResourceRoot = (
  name: BundledResource,
  {
    resourcesPath,
    defaultApp,
    mainDir
  }: {
    resourcesPath?: string
    defaultApp?: boolean
    /** 이 모듈이 실행되는 디렉터리 — 번들은 out/main, vitest 는 src/main. 둘 다 레포 루트 두 단계 아래다 */
    mainDir: string
  }
): string =>
  // Electron 문서: defaultApp 은 기본 Electron 실행 파일에 앱을 넘겨 띄운 경우(`electron .`)에만 true.
  // Dock 에서 연 .app 은 undefined, Electron 밖(vitest)은 resourcesPath 가 없다.
  // 개발 실행은 cwd 가 아니라 모듈 위치로 찾는다 — 레포 밖 cwd 로 띄우면 cwd 기준 경로는 뼈대를 못 찾는다.
  resourcesPath && !defaultApp
    ? join(resourcesPath, name)
    : resolve(mainDir, '../../resources', name)

const bundledPath = (name: BundledResource, segments: string[]): string =>
  join(
    bundledResourceRoot(name, {
      resourcesPath: process.resourcesPath,
      defaultApp: process.defaultApp,
      mainDir: __dirname
    }),
    ...segments
  )

export const vaultKitPath = (...segments: string[]): string => bundledPath('vault-kit', segments)
