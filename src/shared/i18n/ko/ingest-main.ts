// main 위키화 진행 단계·오류(main ipc/ingest-handlers · ingest/)
export const ingestMain = {
  phaseSync: '팀 변경을 받는 중이에요',
  phaseEngine: 'AI 엔진을 준비하는 중이에요',
  phaseWrite: 'AI가 자료를 읽고 위키를 쓰는 중이에요',
  phaseDraft: 'AI가 초안을 쓰는 중이에요',
  phaseAssemble: '위키에 정리하는 중이에요',
  stranded: ' — 승인에서 정리한 뒤 다시 만들어 주세요',
  canceled: '위키 초안 만들기를 취소했어요',
  canceledTail: ' — 자료는 위키 초안 대기함에 그대로 있어요',
  noneWritten: (n: number): string => `AI가 위키 초안을 하나도 쓰지 못했어요 (자료 ${n}개)`,
  againTail: ' — 다시 만들어 주세요',
  allOverlap: 'AI 초안이 모두 기존 페이지와 겹쳐 새로 넣지 못했어요',
  saveBeforeFailed:
    '위키 초안을 만들기 전에 보관함 편집을 저장하지 못했어요 — 잠시 뒤 다시 만들어 주세요',
  prepareStopped: '위키 초안을 만들 준비를 하다 멈췄어요 — 자료는 그대로 있으니 다시 만들어 주세요'
}
