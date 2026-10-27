// 그림 미리보기 배율 — `맞춤`(칸 너비에 맞춰 줄임) 아니면 원본 대비 퍼센트.
// 확대·축소는 정해 둔 단계를 밟는다. 맞춤에서 출발하면 지금 그려진 배율의 바로 다음 단계로 간다.

export type Zoom = 'fit' | number

export const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400] as const

/** 지금 배율(맞춤이면 그려진 배율) 에서 한 단계 위(1)·아래(-1). 끝 단계에서는 그대로 */
export const stepZoom = (current: number, dir: 1 | -1): number => {
  const next =
    dir === 1
      ? ZOOM_STEPS.find((step) => step > current)
      : [...ZOOM_STEPS].reverse().find((step) => step < current)
  return next ?? (dir === 1 ? ZOOM_STEPS[ZOOM_STEPS.length - 1] : ZOOM_STEPS[0])
}

/** ⌘(Windows Ctrl) 와 같이 누른 키 → 배율 동작. 한글 자판에서도 같은 자리 키로 — e.code 를 본다 */
export const zoomKey = (code: string): 'in' | 'out' | 'fit' | null => {
  if (code === 'Equal' || code === 'NumpadAdd') return 'in'
  if (code === 'Minus' || code === 'NumpadSubtract') return 'out'
  if (code === 'Digit0' || code === 'Numpad0') return 'fit'
  return null
}
