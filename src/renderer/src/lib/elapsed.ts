// 경과 시간 문구 — 몇 분씩 걸리는 작업이 멈춘 것처럼 보이지 않게 화면에 붙인다.
import { getT } from './i18n'
export const formatElapsed = (seconds: number): string => getT().common.elapsed(seconds)
