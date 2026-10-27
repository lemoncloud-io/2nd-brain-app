// 같은 일을 겹쳐 돌리지 않는 표 — 키 하나에 진행 중인 일은 하나다. 끝나면(실패해도) 키를 푼다.

export const createInFlight = (): (<T>(
  key: string,
  run: () => Promise<T>,
  busy: T
) => Promise<T>) => {
  const running = new Set<string>()
  return async (key, run, busy) => {
    if (running.has(key)) return busy
    running.add(key)
    try {
      return await run()
    } finally {
      running.delete(key)
    }
  }
}
