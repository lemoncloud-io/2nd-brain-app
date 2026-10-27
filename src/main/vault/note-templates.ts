// 편집기의 "템플릿 넣기" 목록 — 보관함 `templates/` 바로 아래 마크다운(Obsidian 코어 템플릿 폴더와 같은 자리).
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

export const TEMPLATES_DIR = 'templates'

export const listTemplates = (vaultDir: string): { rel: string; name: string }[] => {
  let names: string[]
  try {
    names = readdirSync(join(vaultDir, TEMPLATES_DIR), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map((entry) => entry.name)
  } catch {
    // 템플릿 폴더가 없는 보관함 — 목록이 비었다고 말한다
    return []
  }
  return names
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ rel: `${TEMPLATES_DIR}/${name}`, name: name.slice(0, -3) }))
}
