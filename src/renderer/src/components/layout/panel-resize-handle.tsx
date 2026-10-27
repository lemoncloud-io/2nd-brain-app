import { cn } from '@renderer/lib/utils'
import type { PanelWidth } from './use-panel-width'
import { useT } from '../../lib/i18n'

type PanelResizeHandleProps = { label: string; panel: PanelWidth }

// 패널 가장자리 드래그 띠(포커스 시 좌우 화살표) — dou-app PanelResizeHandle.
// 패널은 relative 이고 스스로 스크롤하지 않아야 한다 — 스크롤 컨테이너 안이면 띠가 같이 밀려 올라간다.
export const PanelResizeHandle = ({ label, panel }: PanelResizeHandleProps): React.JSX.Element => {
  const t = useT()
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={panel.width}
      aria-valuetext={t.shell.resizeValue(label, panel.width)}
      aria-valuemin={panel.minWidth}
      aria-valuemax={panel.maxWidth}
      tabIndex={0}
      onPointerDown={panel.startResize}
      onKeyDown={panel.resizeByKey}
      className={cn(
        'focus-ring tactile absolute inset-y-0 z-10 w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60',
        panel.edge === 'right' ? 'right-0' : 'left-0'
      )}
    />
  )
}
