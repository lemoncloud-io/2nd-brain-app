// 새 볼트 시작 템플릿 — 볼트 계약(VAULT_RULES.md)은 그대로 두고 wiki/topics/ 루트 토픽 시드만 더한다.
// 데이터만 둔다: main 이 파일을 쓰고, renderer 는 이름·설명으로 선택지를 그린다.
// 템플릿 이름·설명은 화면 문구(사전), 토픽 설명은 볼트에 쓰는 본문이라 한국어 그대로다(VAULT_RULES).
import { currentT } from './i18n'

export interface VaultTemplateTopic {
  /** wiki/topics/<slug>.md — VAULT_RULES: 영어 kebab-case 파일명 */
  slug: string
  title: string
  /** 토픽 페이지 첫 문단이자 INDEX·TOPIC_MAP 한 줄 설명 — VAULT_RULES: 본문 산문은 한국어 */
  description: string
}

export interface VaultTemplate {
  id: string
  name: string
  description: string
  topics: VaultTemplateTopic[]
}

export const VAULT_TEMPLATES: VaultTemplate[] = [
  {
    id: 'research',
    get name() {
      return currentT().vaultTemplates.research.name
    },
    get description() {
      return currentT().vaultTemplates.research.description
    },
    topics: [
      {
        slug: 'research-questions',
        title: 'Research Questions',
        description: '지금 답을 찾고 있는 질문'
      },
      { slug: 'methods', title: 'Methods', description: '조사·실험에 쓰는 방법과 도구' },
      { slug: 'findings', title: 'Findings', description: '자료에서 확인한 결과와 결론' }
    ]
  },
  {
    id: 'reading',
    get name() {
      return currentT().vaultTemplates.reading.name
    },
    get description() {
      return currentT().vaultTemplates.reading.description
    },
    topics: [
      { slug: 'books', title: 'Books', description: '읽었거나 읽는 중인 책' },
      { slug: 'themes', title: 'Themes', description: '여러 책에 걸쳐 반복되는 주제' },
      { slug: 'quotes', title: 'Quotes', description: '다시 볼 만한 인용과 메모' }
    ]
  },
  {
    id: 'work',
    get name() {
      return currentT().vaultTemplates.work.name
    },
    get description() {
      return currentT().vaultTemplates.work.description
    },
    topics: [
      { slug: 'projects', title: 'Projects', description: '진행 중이거나 끝난 프로젝트' },
      { slug: 'meetings', title: 'Meetings', description: '회의 기록과 후속 조치' },
      { slug: 'decisions', title: 'Decisions', description: '내린 결정과 그 이유' }
    ]
  }
]

export const findVaultTemplate = (id: string): VaultTemplate | undefined =>
  VAULT_TEMPLATES.find((template) => template.id === id)
