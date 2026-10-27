// 템플릿 시드 적용 — 뼈대 복사 뒤, 첫 커밋 전에 호출한다(createVault).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { VaultTemplate } from '../../shared/vault-templates'
import { mainT } from '../i18n'

export { VAULT_TEMPLATES, findVaultTemplate } from '../../shared/vault-templates'

// 뼈대 INDEX.md·TOPIC_MAP.md 의 빈 토픽 자리표시 — 이 줄만 링크 목록으로 바꾼다
const NO_TOPICS = '_No topics yet._'

// templates/topic-page.md 계약: type: topic, 루트 토픽이라 up 은 비운다
// ui-hangul-ignore: 새 보관함에 쓰는 씨앗 본문 — 볼트 데이터(D8)
const topicPage = (title: string, description: string): string =>
  `---\ntype: topic\nup:\n---\n\n# ${title}\n\n${description}\n\n## Related Notes\n\n_아직 연결된 글이 없다._\n`

const replacePlaceholder = (file: string, list: string): void => {
  const text = readFileSync(file, 'utf8')
  if (!text.includes(NO_TOPICS)) throw new Error(`skeleton has no topic placeholder: ${file}`)
  writeFileSync(file, text.replace(NO_TOPICS, list))
}

/** 템플릿을 얹을 수 있는 뼈대인지 — 복사 전에 확인해 폴더가 반쯤 쓰인 채 남지 않게 한다. 문제 없으면 null */
export const templateSkeletonProblem = (skeleton: string): string | null => {
  for (const file of [join(skeleton, 'wiki', 'INDEX.md'), join(skeleton, 'wiki', 'TOPIC_MAP.md')]) {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      return mainT().vaultMain.templateNoFile(file)
    }
    if (!text.includes(NO_TOPICS)) return mainT().vaultMain.templateNoPlaceholder(file)
  }
  return null
}

export const applyVaultTemplate = (vaultDir: string, template: VaultTemplate): void => {
  // 빈 토픽이면 자리표시가 정답 — 빈 문자열로 지우지 않는다
  if (template.topics.length === 0) return
  // 두 파일을 쓰기 전에 먼저 검증 — 하나라도 없으면 첫 파일만 바뀐 채 남지 않는다
  const targets = [join(vaultDir, 'wiki', 'INDEX.md'), join(vaultDir, 'wiki', 'TOPIC_MAP.md')]
  for (const file of targets) {
    if (!readFileSync(file, 'utf8').includes(NO_TOPICS))
      throw new Error(`skeleton has no topic placeholder: ${file}`)
  }
  for (const topic of template.topics) {
    writeFileSync(
      join(vaultDir, 'wiki', 'topics', `${topic.slug}.md`),
      topicPage(topic.title, topic.description)
    )
  }
  const list = template.topics
    .map((topic) => `- [[topics/${topic.slug}]] — ${topic.description}`)
    .join('\n')
  replacePlaceholder(join(vaultDir, 'wiki', 'INDEX.md'), list)
  replacePlaceholder(join(vaultDir, 'wiki', 'TOPIC_MAP.md'), list)
}
