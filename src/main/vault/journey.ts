// 첫 실행 체크리스트의 볼트 쪽 진행 — 저장하지 않고 볼트 git 에서 매번 읽는다. 앱을 다시 깔아도 같은 답이 나온다.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { git } from '../git'
import { defaultBranchOf } from '../engine/work-branch'
import type { Journey } from '../../shared/ipc-contract'

const MERGE_SUBJECT = '^merge: app/ingest-'

export const readJourney = (vaultDir: string): Journey => {
  const inbox = join(vaultDir, 'Clippings')
  const clippings = existsSync(inbox)
    ? readdirSync(inbox).filter((name) => !name.startsWith('.')).length
    : 0
  const defaultBranch = defaultBranchOf(vaultDir)
  // 승인 확정은 `merge: app/ingest-…` 병합 커밋을 남긴다(review-service finalize). 되돌리면 기본 브랜치에서 사라진다
  const merged =
    defaultBranch !== null &&
    git(vaultDir, [
      'log',
      defaultBranch,
      `--grep=${MERGE_SUBJECT}`,
      '--format=%H',
      '-n',
      '1'
    ]).trim() !== ''
  const ingested =
    merged ||
    git(vaultDir, ['for-each-ref', '--format=%(refname)', 'refs/heads/app/ingest-*']).trim() !== ''
  return { clippings, ingested, merged }
}
