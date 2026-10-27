// 가짜 업데이트 주소 — electron-updater generic provider 가 읽는 latest*.yml 과 설치 파일 하나를 내준다.
// 앱에는 `SECOND_BRAIN_UPDATE_FEED` 로 이 주소를 준다(패키징 안 된 실행에서만 읽힌다 — src/main/update/updater.ts).
import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ServeFixture } from './fixtures'

/** 앱 버전보다 높아야 새 버전으로 읽힌다 — e2e 는 out/main 을 바로 띄워 Electron 버전(39.x)을 앱 버전으로 읽는다 */
export const NEXT_VERSION = '999.0.0'

export const fakeUpdateServer = async (
  serve: ServeFixture
): Promise<{ env: Record<string, string>; downloads: string[] }> => {
  // 내용은 아무것이나 — electron-updater 는 받은 뒤 sha512 만 대조하고 준비됨을 알린다
  // (mac: MacUpdater 가 Squirrel 에 넘기기 전에 update-downloaded 를 쏜다)
  const payload = Buffer.from('2nd-brain e2e fake update payload\n'.repeat(64))
  const sha512 = createHash('sha512').update(payload).digest('base64')
  const file =
    process.platform === 'win32'
      ? `2nd-brain-app-${NEXT_VERSION}-setup.exe`
      : `2nd-brain-app-${NEXT_VERSION}-${process.arch}-mac.zip`
  const manifest = [
    `version: ${NEXT_VERSION}`,
    'files:',
    `  - url: ${file}`,
    `    sha512: ${sha512}`,
    `    size: ${payload.length}`,
    `path: ${file}`,
    `sha512: ${sha512}`,
    `releaseDate: '2026-09-27T00:00:00.000Z'`,
    ''
  ].join('\n')

  const downloads: string[] = []
  const port = await serve((req: IncomingMessage, res: ServerResponse): void => {
    const path = (req.url ?? '').split('?')[0]
    if (path === '/latest-mac.yml' || path === '/latest.yml') {
      res.writeHead(200, { 'content-type': 'text/yaml' })
      res.end(manifest)
      return
    }
    if (path === `/${file}`) {
      downloads.push(path)
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': String(payload.length)
      })
      res.end(payload)
      return
    }
    res.writeHead(404)
    res.end()
  })
  return { env: { SECOND_BRAIN_UPDATE_FEED: `http://127.0.0.1:${port}/` }, downloads }
}
