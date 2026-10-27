// 처음 3걸음 — 준비(엔진 연결·보관함)가 끝난 뒤 첫 승인까지 가는 길.
// 준비 게이트는 lib/start-steps.ts가 쥔다(엔진+보관함 둘뿐) — 여기는 그 다음을 잰다.
// 정본은 파생뿐이고 저장하지 않는다: 오늘 노트 존재·위키화 실행·승인 병합.
// 하루 루프만 쓰는 사람은 이 셋을 영영 안 해도 된다 — 그래서 complete가 아니어도 시작하기에 갇히지 않는다.

import type { VaultTreeEntry } from '../../../shared/ipc-contract'
import type { Journey } from '../../../shared/ipc/vault'

export const FIRST_STEPS = ['today', 'clip', 'approve'] as const
export type FirstStepId = (typeof FIRST_STEPS)[number]

export type FirstRunProgress = {
  done: Record<FirstStepId, boolean>
  /** 처음으로 안 끝난 걸음. 다 끝났거나 아직 확인 중이면 null */
  current: FirstStepId | null
  /** 오늘 노트·위키화·승인을 다 마쳤다 — 첫 성공이다 */
  complete: boolean
  checking: boolean
}

export const firstRunProgress = ({
  today,
  ingested,
  merged
}: {
  /** 오늘 노트가 있다. 아직 모르면 null */
  today: boolean | null
  /** 위키화를 한 번이라도 돌렸다(작업 브랜치가 있다). 아직 모르면 null */
  ingested: boolean | null
  /** 승인 병합이 기본 브랜치에 있다. 아직 모르면 null */
  merged: boolean | null
}): FirstRunProgress => {
  if (today === null || ingested === null || merged === null) {
    return {
      done: { today: false, clip: false, approve: false },
      current: null,
      complete: false,
      checking: true
    }
  }
  // 자료는 넣음만으로 끝이 아니다 — 위키화를 돌려야 다음 걸음으로 간다.
  // 넣은 자료 수는 버튼 문구(위키화 시작)만 정하고 done은 ingested가 정한다.
  const done: Record<FirstStepId, boolean> = {
    today,
    clip: ingested || merged,
    approve: merged
  }
  const complete = FIRST_STEPS.every((step) => done[step])
  const current = complete ? null : (FIRST_STEPS.find((step) => !done[step]) ?? null)
  return { done, current, complete, checking: false }
}

/**
 * 첫걸음 진행 파생 한 곳 — StartView(FirstSteps·완료 배너)와 지식 관리의 복귀 단추가 같은 식으로 잰다.
 * 계산이 두 곳에 있으면 조건이 어긋난다(복귀 단추가 준비 기준으로 뜨던 버그).
 */
export const firstRunOf = (
  tree: VaultTreeEntry[] | null,
  todayRel: string | null,
  journey: Journey | null
): FirstRunProgress =>
  firstRunProgress({
    today: tree === null ? null : todayRel !== null,
    ingested: journey === null ? null : journey.ingested,
    merged: journey === null ? null : journey.merged
  })
