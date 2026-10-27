// 3D 렌더러가 죽어도 그래프 탭만 잃게 막는다 — 청크 로드 실패·WebGL 초기화 실패는
// 렌더 도중 던지므로 부모가 try/catch 로 잡을 수 없고, 잡지 않으면 앱 트리 전체가 사라진다.
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { onError: (error: unknown) => void; children: ReactNode }

export class GraphErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('could not draw the 3D graph', error, info.componentStack)
    this.props.onError(error)
  }

  render(): ReactNode {
    // 까닭과 "다시 그리기" 는 부모가 낸다 — 여기서는 죽은 자리를 비우기만 한다
    return this.state.failed ? null : this.props.children
  }
}
