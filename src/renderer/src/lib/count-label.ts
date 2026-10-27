// 글 분량 한 줄 — 편집기 아래 줄. 세기는 `shared/wiki/text-count`.
import type { TextCount } from '../../../shared/wiki/text-count'
import { formatNumber, getT } from './i18n'

/** `1,234자 · 단어 321개` */
export const countLabel = ({ chars, words }: TextCount): string =>
  getT().doc.count(formatNumber(chars), formatNumber(words))
