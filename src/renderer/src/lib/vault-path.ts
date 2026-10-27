// 보관함 안 경로를 화면 말로 바꾼다.
// 경로(`wiki/topics/ai-agent.md`)는 개발자의 주소 체계다 — 사용자는 폴더와 이름으로 찾는다.
// 원문이 필요하면 툴팁으로 남긴다(ViewHeader descriptionTitle).
// 보관함 최상위 폴더는 저장 위치가 아니라 안에 든 것으로 부른다(t.library.root)
import { getT } from './i18n'

/** 확장자를 떼어 낸 파일 이름 */
export const fileTitle = (rel: string): string =>
  (rel.split('/').at(-1) ?? rel).replace(/\.[^./]+$/, '')

const foldersOf = (rel: string): string[] =>
  rel
    .split('/')
    .slice(0, -1)
    .map((part) => getT().library.root[part] ?? part)

/** `wiki/topics/ai-agent.md` → `위키 · topics · ai-agent` */
export const folderLabel = (rel: string): string => [...foldersOf(rel), fileTitle(rel)].join(' · ')

/** 담긴 폴더만 — `wiki/topics/ai-agent.md` → `위키 · topics`. 맨 위 파일이면 빈 글자 */
export const parentLabel = (rel: string): string => foldersOf(rel).join(' · ')

/** 바로 위 폴더의 화면 이름 — 맨 위 파일이면 없다 */
export const folderName = (rel: string): string | undefined => foldersOf(rel).at(-1)

/**
 * 좁은 자리(칩·사이드바 북마크 줄)용 — 바로 위 폴더와 이름만. 깊은 경로를 다 늘어놓으면 칩 여러 개가 벽이 된다.
 * `projects/x/outputs/2026-09-10-review.md` → `outputs · 2026-09-10-review`
 */
export const shortLabel = (rel: string): string => {
  const parent = folderName(rel)
  return parent === undefined ? fileTitle(rel) : `${parent} · ${fileTitle(rel)}`
}
