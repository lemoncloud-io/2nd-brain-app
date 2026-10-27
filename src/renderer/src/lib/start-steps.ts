// 시작하기 체크리스트 — 준비 상태에서 단계별 완료와 지금 할 단계를 계산한다. 저장하지 않는다.
//
// 준비(setupComplete)는 둘뿐이다: 엔진 연결과 보관함. 자료 넣기·위키화·승인은 매일 도는 일이지 준비가 아니다 —
// 하루 루프만 쓰는 사람은 그 셋을 영영 하지 않으므로, 준비 조건에 두면 앱이 매번 시작하기로 열린다.
// 그 셋의 안내는 지식 관리의 자료 구역에 있다.
//
// 첫 실행에만 질문과 GitHub 단계가 붙는다: 질문 → AI 연결 → GitHub → 보관함 → GitHub에 올리기.
// 질문·GitHub 은 준비 조건이 아니다 — 보관함이 생기면 끝난 것으로 본다(답은 방향 문서로 옮겨졌고, GitHub 은 나중에 할 수 있다).
// 시작하기를 한 번 끝낸 사람(startDone)은 질문·GitHub 단계를 보지 않는다.
// GitHub에 올리기는 모두에게 마지막 걸음이다 — 보관함에 원격이 붙으면 끝난다. 템플릿으로 만들면 저절로 끝나고,
// "나중에 하기"·이 기능 전 사용자는 여기 남는다. 준비 조건은 아니라 남아 있어도 시작하기에 갇히지 않는다.
import type { EngineReadiness, VaultReadiness } from '../hooks/use-setup-state'

export type StartStepId = 'purpose' | 'engine' | 'github' | 'vault' | 'publish'

const FIRST_RUN_STEPS: readonly StartStepId[] = ['purpose', 'engine', 'github', 'vault', 'publish']
const RETURNING_STEPS: readonly StartStepId[] = ['engine', 'vault', 'publish']

export type StartProgress = {
  /** 이 사람에게 보이는 단계 — 순서대로 */
  steps: readonly StartStepId[]
  done: Record<StartStepId, boolean>
  /** 처음으로 안 끝난 단계. 다 끝났거나 아직 확인 중이면 null */
  current: StartStepId | null
  /** 지금 단계가 몇 번째인지(1부터). current 가 없으면 null */
  position: number | null
  /** 연결과 보관함이 끝났다 — 시작하기를 치우고 오늘 노트로 연다 */
  complete: boolean
  checking: boolean
}

export const setupComplete = ({
  engine,
  vault
}: {
  engine: EngineReadiness
  vault: VaultReadiness
}): boolean => engine === 'ok' && vault === 'ok'

export const startProgress = ({
  purpose,
  engine,
  github,
  vault,
  remote,
  deferredGithub,
  startDone
}: {
  /** 첫 질문에 답했거나 건너뛰었다. 아직 모르면 null */
  purpose: boolean | null
  engine: EngineReadiness
  /** GitHub 에 로그인돼 있다. 아직 모르면 null — 기다리지 않는다: 로그인 칸이 확인 중·읽기 실패를 스스로 보인다 */
  github: boolean | null
  vault: VaultReadiness
  /** 보관함에 GitHub 저장소가 연결돼 있다. 아직 모르거나 읽지 못했으면 null — 올리기를 지금 단계로 내밀지 않는다 */
  remote: boolean | null
  /** GitHub 을 나중에 하기로 했다 — 이 컴퓨터에만 보관함을 만든다 */
  deferredGithub: boolean
  /** 시작하기를 한 번 끝냈다(lib/start-done.ts) */
  startDone: boolean
}): StartProgress => {
  const steps = startDone ? RETURNING_STEPS : FIRST_RUN_STEPS
  const vaultOk = vault === 'ok'
  const done: Record<StartStepId, boolean> = {
    purpose: purpose === true || vaultOk,
    engine: engine === 'ok',
    github: github === true || deferredGithub || vaultOk,
    vault: vaultOk,
    publish: vaultOk && remote === true
  }
  // 질문 답을 모르면 기다린다 — 모르는 채로 정하면 이미 답한 사람에게 질문을 한 번 비춘다
  const checking =
    engine === 'checking' ||
    vault === 'checking' ||
    (steps.includes('purpose') && !done.purpose && purpose === null)
  // 원격을 모르면 올리기는 지금 단계가 아니다 — 연결된 사람에게 올리기 칸을 펼쳐 보이게 된다
  const current = checking
    ? null
    : (steps.find((step) => !done[step] && !(step === 'publish' && remote === null)) ?? null)
  return {
    steps,
    done,
    current,
    position: current === null ? null : steps.indexOf(current) + 1,
    complete: setupComplete({ engine, vault }),
    checking
  }
}
