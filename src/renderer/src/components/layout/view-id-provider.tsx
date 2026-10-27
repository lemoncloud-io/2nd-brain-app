import type { ViewId } from '../../store/workbench'
import { ViewContext } from './view-id'

/** 뷰 안쪽이 자기 id 를 알게 한다 — 숨긴 채 마운트된 뷰가 폴링을 멈출 수 있게 */
export const ViewIdProvider = ({
  id,
  children
}: {
  id: ViewId
  children: React.ReactNode
}): React.JSX.Element => <ViewContext.Provider value={id}>{children}</ViewContext.Provider>
