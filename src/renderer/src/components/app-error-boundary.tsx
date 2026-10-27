// 앱 전체 경계 — 렌더 중 throw 는 부모가 try/catch 로 잡을 수 없고, 잡지 않으면 앱 트리 전체가 사라져 빈 창만 남는다.
// 여기서 잡아 기록으로 보내고 복구 화면(다시 열기·기록 폴더)을 보인다. 그래프·도표는 자기 경계가 먼저 잡는다.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { CrashScreen } from './crash-screen'
import { reportRenderError } from '../lib/report-error'

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportRenderError(error, info.componentStack)
  }

  render(): ReactNode {
    return this.state.failed ? <CrashScreen /> : this.props.children
  }
}
