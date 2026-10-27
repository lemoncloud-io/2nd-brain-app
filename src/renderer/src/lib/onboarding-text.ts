// 첫 실행 시작하기 문구 — 질문 → AI 연결 → GitHub → 보관함. 문장은 사전(`t.onboarding`), 여기는 상태로 고르는 것만.
// 말투·용어는 DESIGN.md § 화면 말 — 저장 구조 이름(vault·repo·push)은 내지 않는다.
import type { VaultStatus } from '../../../shared/ipc-contract'
import { getT } from './i18n'

/** 첫 실행은 몇 분 걸린다 — 어디쯤인지 머리에 한 줄로 */
export const stepPositionText = (position: number, total: number): string =>
  getT().onboarding.stepPosition(position, total)

/** 보관함 단계가 끝났을 때 한 줄 — 어디에 생겼는지 */
export const starterSummary = (starter: NonNullable<VaultStatus['starter']>): string => {
  const t = getT().onboarding
  if (starter.publishError !== undefined) return t.starterLocalPublishFailed
  if (starter.via === 'local') return t.starterLocal
  // 템플릿을 볼 수 없는 계정은 앱 기본 보관함으로 만든다 — 실패가 아니라 다른 출발점이다
  const origin = starter.via === 'skeleton' ? t.starterSkeleton : ''
  return t.starterPublished(origin, starter.repo ?? '')
}

/** 저장소 웹 주소 → 사람이 읽는 `주인/이름` */
export const repoLabel = (webUrl: string): string => webUrl.replace(/^https?:\/\/[^/]+\//, '')
