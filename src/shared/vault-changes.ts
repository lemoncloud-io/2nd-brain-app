// 보관함에서 달라진 파일 — main 이 git 에서 읽어 뜻만 내보내고(main/vault/git-status.ts),
// renderer 가 트리 배지 문구를 붙인다(lib/tree-model.ts `changeLabel`).
// 여기 있는 것은 그 둘이 주고받는 낱말뿐이다 — git 코드는 넘어오지 않는다.

/** 지운 파일은 없다 — 트리에 행이 없어 배지를 달 자리가 없다(main/vault/git-status.ts) */
export type VaultFileChange = 'changed' | 'new'

/** 보관함 상대 경로 → 무엇이 달라졌나. 평소 상태인 파일은 담기지 않는다 */
export type VaultChangeMap = Record<string, VaultFileChange>
