import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyLanguage } from './lib/i18n'
import { installErrorReporting } from './lib/report-error'
import { AppErrorBoundary } from './components/app-error-boundary'

// 배포본에는 DevTools 가 없다 — 잡히지 않은 오류를 main 기록으로 보낸다. 다른 무엇보다 먼저
installErrorReporting()

// 첫 페인트 깜빡임 방지 — 렌더 전에 초기 테마를 적용한다(부팅 인자, preload 제공)
document.documentElement.classList.toggle('dark', window.api.initialTheme() === 'dark')
// 언어도 렌더 전에 — 부팅 인자는 창을 띄운 때 값이라 reload 뒤에는 저장된 값으로 한 번 더 맞춘다.
// 다른 창에서 바꾼 것도 받는다
applyLanguage(window.api.initialLanguage())
void window.api
  .getLanguage()
  .then(applyLanguage)
  // 못 읽으면 부팅 인자의 언어 그대로 둔다 — 첫 페인트에 이미 걸렸다. 다른 창에서 바꾼 뒤의 reload 면 옛 언어일 수 있어 남긴다
  .catch((e: unknown) => console.warn('[i18n] getLanguage failed — keeping boot language', e))
window.api.onLanguageChanged(applyLanguage)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
)
