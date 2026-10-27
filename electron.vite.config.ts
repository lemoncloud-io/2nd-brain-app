import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    // 3D 캔버스는 lazy 로 불러온다 — dev 에서 그때 처음 발견되면 vite 가 의존성을 다시 묶으며
    // 페이지를 새로 고치고, 그 사이에 로드된 청크가 React 를 두 벌 잡아 훅이 터진다.
    // 미리 묶어 두면 그 재실행 자체가 없다
    optimizeDeps: {
      include: [
        'react-force-graph-3d',
        'three',
        'three/examples/jsm/postprocessing/UnrealBloomPass.js'
      ]
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
