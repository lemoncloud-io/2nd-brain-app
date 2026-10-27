// 문서 기록 한 줄의 말 — 누가 · 언제. 옆 칸 목록과 가운데 바뀐 줄 머리가 같이 쓴다.
import type { DocVersion } from '../../../shared/ipc-contract'
import { getLocale, getT } from './i18n'

export const versionWho = (version: DocVersion): string => {
  switch (version.kind) {
    case 'ai':
      return getT().doc.versionAi
    case 'me':
      return getT().doc.versionMe
    case 'person':
      return getT().doc.versionPerson(version.author)
    case 'app':
      return getT().doc.versionApp
  }
}

/** "10월 2일 오후 3:04" — 같은 날 여러 번 고친 것을 가를 수 있게 시각까지 */
export const versionWhen = (version: DocVersion): string =>
  new Date(version.date).toLocaleString(getLocale(), {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
