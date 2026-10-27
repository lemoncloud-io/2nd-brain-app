// 위키화 한 번은 볼트에서 작업 브랜치 하나다 — 화면에는 브랜치 이름 대신 날짜로 부른다.
// 이름 규칙은 main 의 work-branch.ts(`app/ingest-<날짜>[-<n>]`)와 같다. 같은 날 다시 돌리면 -2, -3 이 붙는다.
import { getT } from './i18n'
const RUN = /^app\/ingest-\d{4}-(\d{2})-(\d{2})(?:-(\d+))?$/

export const runLabel = (branch: string): string => {
  const match = RUN.exec(branch)
  const t = getT().library
  if (!match) return t.runThis
  const [, month, day, repeat] = match
  const date = t.runDate(Number(month), Number(day))
  return repeat ? t.runRepeat(date, repeat) : date
}
