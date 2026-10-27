import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// 타이밍에 민감한 테스트 — 병렬 파일 부하에서 fs.watch 이벤트를 잃는다
const WATCH_FILES = ['src/main/vault/vault-watcher.test.ts']

export default defineConfig({
  // 앱과 같은 별칭 — 컴포넌트가 `@renderer/...` 로 서로를 부른다(electron.vite.config.ts 와 같은 값)
  resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
  test: {
    // e2e 폴더에도 순수 함수가 산다(임시 그루 걷기) — Playwright 가 도는 `*.spec.ts` 는 여기 안 걸린다
    // fs.watch(FSEvents) 타이밍 테스트는 파일 단위로 격리한다 — 병렬 파일 부하에서 이벤트를 잃는다.
    // `pnpm test` 는 두 프로젝트를 순서대로 돌린다(package.json) — watch 가 단독으로 뛰게.
    // 단독 `--project` 실행은 대표성이 없다: unit 만 돌리면 watcher 가 빠지고(조용히 green),
    // watch 없이 `vitest run` 은 둘이 병렬로 뛰어 격리가 깨진다. 정본은 `pnpm test` 다.
    // 실측 (179파일·1756테스트): 분리 전 1:24 → 분리 후 33/34/35초 3회 연속 green.
    // 같은 파일을 두 번 적지 않게 상수 하나로 묶는다.
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'e2e/**/*.test.ts'],
          exclude: WATCH_FILES
        }
      },
      {
        test: {
          name: 'watch',
          include: WATCH_FILES
        }
      }
    ]
  }
})
