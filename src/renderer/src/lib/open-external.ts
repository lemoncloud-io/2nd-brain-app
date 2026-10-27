// 바깥 링크를 여는 단일 지점 — http(s) 주소는 앱 안의 새 웹 탭으로, ⌘/Ctrl+클릭(`external`)과 mailto 는
// 기본 브라우저·메일 앱으로(main 이 http·https·mailto 만 연다).
// 모듈 상수인 이유: 렌더마다 새 함수를 주면 리더의 링크·이미지가 다시 마운트된다(wikilink-markdown.tsx).
// 브라우저가 없으면 main 이 거절한다 — 알릴 곳이 없는 자리라 조용히 둔다(클릭한 것은 그대로 보인다)
import { isWebUrl } from '../../../shared/web-address'
import { useWorkbench } from '../store/workbench'

export type OpenLink = (url: string, options?: { external?: boolean }) => void

export const openExternal: OpenLink = (url, options) => {
  if (options?.external !== true && isWebUrl(url)) {
    useWorkbench.getState().openWeb(url)
    return
  }
  window.api.openExternal(url).catch(() => undefined)
}
