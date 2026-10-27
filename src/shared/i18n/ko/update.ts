// 앱 새 버전 한 줄(renderer lib/update-text.ts)
export const update = {
  now: (current: string | null): string => (current ? `지금 버전 ${current}` : '지금 버전'),
  off: (now: string): string => `${now} · 새 버전은 팀에서 보내 드려요`,
  latest: (now: string): string => `${now} · 최신 버전이에요`,
  checking: (now: string): string => `${now} · 새 버전이 있는지 보는 중…`,
  downloading: (version: string, percent: number): string =>
    `새 버전 ${version} 받는 중 · ${percent}%`,
  ready: (version: string): string => `새 버전 ${version} 준비됨 · 다시 시작하면 바뀌어요`,
  installFailed: (now: string): string =>
    `${now} · 새 버전으로 바꾸지 못했어요 — 다시 시작을 한 번 더 눌러 주세요`,
  checkFailed: (now: string): string => `${now} · 새 버전이 있는지 확인하지 못했어요`
}
