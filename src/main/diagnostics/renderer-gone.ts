// 앱 창의 화면(렌더러)이 죽은 뒤 — 창은 빈 채로 남고 렌더러 쪽 복구 화면도 못 뜬다. main 대화상자로 고르게 한다.
// 죽은 화면으로는 설정에 갈 수 없으니 진단 정보 내보내기를 여기서 바로 준다.
// 대화상자는 부를 때 속성으로 읽는다 — e2e 가 고정한다.
import { dialog, type BrowserWindow } from 'electron'
import { log } from './install'
import { exportDiagnostics } from '../ipc/diagnostics-handlers'
import { mainT } from '../i18n'

const REOPEN = 0
const EXPORT = 1
const CLOSE = 2

export const askAfterRendererGone = async (win: BrowserWindow): Promise<void> => {
  try {
    const t = mainT().diagnostics
    const { response } = await dialog.showMessageBox(win, {
      type: 'error',
      message: t.rendererGoneTitle,
      detail: t.rendererGoneDetail,
      buttons: [t.reopen, t.exportDiagnostics, t.closeWindow],
      defaultId: REOPEN,
      cancelId: CLOSE
    })
    if (win.isDestroyed()) return
    log().info('main', 'render-process-gone choice', response)
    // 죽은 화면은 닫기(숨기기)로 남기지 않는다 — 다시 꺼내도 빈 창이다. 창을 없애면 다음 activate 가 새로 띄운다
    if (response === CLOSE) {
      win.destroy()
      return
    }
    if (response === EXPORT) {
      await exportDiagnostics(win).catch((error: unknown) => {
        log().error('main', 'diagnostics export failed', error)
        dialog.showErrorBox(t.exportFailed, String(error))
      })
    }
    // 내보냈어도 창은 다시 연다 — 빈 창만 두지 않게
    if (!win.isDestroyed()) win.reload()
  } catch (error) {
    log().error('main', 'render-process-gone dialog failed', error)
  }
}
