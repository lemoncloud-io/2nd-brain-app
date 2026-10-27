// 지금 무대가 밤인가 낮인가 — 테마 정본은 <html> 의 dark 클래스다(views/appearance-section.tsx).
// 3D 캔버스와 툴바 범례가 같은 답을 봐야 색표와 그림이 갈라지지 않는다.
import { useSyncExternalStore } from 'react'
import type { Stage } from './graph-3d-look'

// 테마 버튼은 클래스만 바꾸고 알림을 주지 않는다 — 그 클래스를 직접 지켜본다
const subscribe = (notify: () => void): (() => void) => {
  const watch = new MutationObserver(notify)
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => watch.disconnect()
}

const read = (): Stage => (document.documentElement.classList.contains('dark') ? 'dark' : 'light')

// 서버 렌더(테스트의 renderToStaticMarkup)에는 document 가 없다 — 낮으로 본다
export const useStage = (): Stage => useSyncExternalStore(subscribe, read, () => 'light')
