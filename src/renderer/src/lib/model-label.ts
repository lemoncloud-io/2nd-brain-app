// 모델 이름을 화면에 쓸 만큼 줄인다 — `claude-` 머리와 `[1m]`·날짜 꼬리표는 사람이 읽을 거리가 아니다.
// 원문은 지우지 않는다: 지표 줄이 `title` 로 그대로 들고 있어 도움을 청할 때 줄 것이 남는다.
export const shortModel = (model: string): string =>
  model
    .replace(/^claude-/, '')
    .replace(/\[[^\]]*\]$/, '')
    .replace(/-\d{8}$/, '')
