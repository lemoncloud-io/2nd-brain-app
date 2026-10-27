// 사용자가 붙여 넣는 GitHub 저장소 주소의 단일 판정 — 화면이 누르기 전에 알려 주고, main 이 누른 뒤 다시 본다.
// 양쪽이 같은 규칙을 봐야 "연결"이 될 주소만 활성화된다.
import { currentT } from './i18n'

const GITHUB_REPO =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/

/** GitHub 저장소 주소 → clone 주소. GitHub 저장소 주소가 아니면 null */
export const githubCloneUrl = (input: string): string | null => {
  const match = GITHUB_REPO.exec(input.trim())
  return match ? `https://github.com/${match[1]}/${match[2]}.git` : null
}

/** 주소 칸 아래에 띄울 한 줄. 아직 아무것도 안 썼거나 올바르면 null */
export const githubUrlHint = (input: string): string | null => {
  const text = input.trim()
  if (text === '' || githubCloneUrl(text)) return null
  const t = currentT().github
  if (/^git@github\.com:/.test(text)) return t.sshUrl
  if (/github\.com\/[^/]+\/[^/]+\/.+/.test(text)) return t.innerUrl
  if (/^https?:\/\//.test(text) && !/github\.com/.test(text)) return t.notGithub
  return t.urlShape
}
