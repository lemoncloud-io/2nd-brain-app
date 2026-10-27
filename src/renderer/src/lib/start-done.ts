// 시작하기를 한 번 끝냈는지 — 앱을 열 때 어느 탭으로 여는지만 정한다.
// 이 값을 두는 이유: 준비 상태는 엔진 CLI 를 실제로 실행해 봐야 알고, 그동안 잠긴 탭을 먼저 그렸다가
// 뒤늦게 끌어오면 사용자가 그 사이 누른 곳을 빼앗는다. 첫 화면은 기다리지 않고 정해야 한다.
// 진행 자체는 여전히 볼트의 git 이 정본이다(lib/start-steps.ts) — 여긴 첫 탭 힌트일 뿐이다.
const KEY = 'second-brain.start.done'

/** localStorage 를 못 쓰는 환경(테스트·시크릿 창)에서도 앱은 떠야 한다 */
export const startDone = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const markStartDone = (): void => {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // 못 적어도 다음 실행에 시작하기로 열릴 뿐이다 — 막을 일은 아니다
  }
}
