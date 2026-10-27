// 보관함 git 을 바꾸는 일의 줄 — 받기·편집 저장·채팅 쓰기·되돌리기가 한 보관함에서 한 번에 하나씩 돈다.
// 받기는 `fetch` 를 기다리는 동안 이벤트 루프를 놓는다. 그 틈에 다른 커밋이 끼면 병합이 엉킨다.
// 위키화·확정은 줄에 서지 않는다 — 분 단위 작업이 받기를 막으면 안 되고, `vaultActivity` 배제가 따로 막는다.
const tails = new Map<string, Promise<void>>()

/** 앞선 일이 끝난 뒤 `fn` 을 돌린다. 앞선 일의 실패는 뒤로 번지지 않는다 */
export const withVaultGit = <T>(vaultDir: string, fn: () => T | Promise<T>): Promise<T> => {
  const before = tails.get(vaultDir) ?? Promise.resolve()
  const run = before.then(fn)
  const tail = run.then(
    () => undefined,
    () => undefined
  )
  tails.set(vaultDir, tail)
  void tail.then(() => {
    if (tails.get(vaultDir) === tail) tails.delete(vaultDir)
  })
  return run
}
