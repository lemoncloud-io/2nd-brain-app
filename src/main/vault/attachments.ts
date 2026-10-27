// 붙여넣기·끌어 놓은 그림 — 보관함 `attachments/` 에 두고 문서에는 `![[attachments/…]]` 로 건다(Obsidian 과 같은 모양).
// 파일은 여기서 쓰기만 한다. 커밋은 그 그림을 건 문서를 저장할 때 같이 한다(`WikiService.write`).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { mainT } from '../i18n'

export const ATTACHMENTS_DIR = 'attachments'

/** 한 번에 받는 크기 — 그림 한 장이 이보다 크면 보관함이 무거워진다 */
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024

const pad = (n: number): string => String(n).padStart(2, '0')

/** 클립보드 그림은 이름이 `image.png` 뿐이다 — 붙인 시각으로 이름을 짓는다 */
const pastedName = (ext: string, now: Date): string =>
  `Pasted image ${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${ext}`

/** 경로 조각·제어 문자·링크 문법을 깨는 글자를 뺀다 */
const safeName = (name: string): string =>
  name
    // eslint-disable-next-line no-control-regex -- 파일 이름의 제어 문자를 지우는 것이 목적이다
    .replace(/[\\/:*?"<>|[\]#^\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export type AttachmentResult = { ok: true; rel: string } | { ok: false; reason: string }

export const saveAttachment = (
  vaultDir: string,
  name: string,
  bytes: Uint8Array,
  now = new Date()
): AttachmentResult => {
  if (bytes.byteLength === 0) return { ok: false, reason: mainT().vaultMain.emptyFile }
  if (bytes.byteLength > ATTACHMENT_MAX_BYTES) {
    return { ok: false, reason: mainT().vaultMain.attachTooBig }
  }
  const ext = extname(name).toLowerCase()
  const cleaned = safeName(name)
  const base =
    /^image\.[a-z0-9]+$/i.test(cleaned) || cleaned === '' || cleaned === ext
      ? pastedName(ext || '.png', now)
      : cleaned
  const dir = join(vaultDir, ATTACHMENTS_DIR)
  mkdirSync(dir, { recursive: true })
  const stem = base.slice(0, base.length - extname(base).length)
  const suffix = extname(base)
  let chosen = base
  for (let i = 1; existsSync(join(dir, chosen)); i += 1) chosen = `${stem} ${i}${suffix}`
  // wx: 그 사이 같은 이름이 생겼으면 덮지 않고 실패한다
  writeFileSync(join(dir, chosen), bytes, { flag: 'wx' })
  return { ok: true, rel: `${ATTACHMENTS_DIR}/${chosen}` }
}

const EMBED_RE = /!\[\[([^[\]|#]+)(?:[|#][^[\]]*)?\]\]|!\[[^\]]*\]\(([^)\s]+)\)/g

/** 글이 건 `attachments/` 파일 중 실제로 있는 것 — 저장 커밋에 같이 싣는다 */
export const referencedAttachments = (vaultDir: string, text: string): string[] => {
  const found = new Set<string>()
  for (const m of text.matchAll(EMBED_RE)) {
    let target = (m[1] ?? m[2] ?? '').trim()
    try {
      target = decodeURI(target)
    } catch {
      // 사람이 쓴 주소는 깨져 있을 수 있다 — 원문 그대로 본다
    }
    if (!target.startsWith(`${ATTACHMENTS_DIR}/`) || target.includes('..')) continue
    if (existsSync(join(vaultDir, target))) found.add(target)
  }
  return [...found]
}
