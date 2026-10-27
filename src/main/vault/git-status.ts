// 보관함에서 달라진 파일 — 트리 배지의 단일 출처. git 어휘는 이 파일 안에서 끝난다:
// 밖으로 나가는 것은 `changed`·`new` 두 뜻뿐이고, 화면 문구는 renderer 가 붙인다
// (PRODUCT.md 원칙 4 — git 은 숨긴다).
import { execFile } from 'node:child_process'
import { gitRuntime } from '../git'
import type { VaultChangeMap, VaultFileChange } from '../../shared/vault-changes'
import { withVaultGit } from './vault-queue'

/**
 * porcelain 두 글자를 뜻 하나로. 앞뒤(색인·작업본)를 합쳐 본다 — 색인에 넣고 또 고친 파일은
 * 사용자에게는 그냥 바뀐 파일이다. `--no-renames` 로 읽어 이름 바뀜은 지움+새 파일로 온다.
 * 지운 파일(`D`)은 담지 않는다 — 트리에 행이 없어 배지를 달 자리가 없고, 그 폴더에만
 * 이유를 알 수 없는 점이 영영 남는다.
 */
const meaningOf = (code: string): VaultFileChange | null => {
  if (code === '??') return 'new'
  const marks = code.replace(/ /g, '')
  // 충돌 표시(`U`)가 먼저다 — `DU`(우리가 지웠고 상대 것이 작업본에 있다)는 행이 있는 파일이다
  if (marks.includes('U')) return 'changed'
  if (marks.includes('D')) return null
  if (marks.includes('A')) return 'new'
  if (/[MT]/.test(marks)) return 'changed'
  return null
}

/**
 * `-z` 로 읽는다 — 공백·한글·따옴표가 든 경로를 git 이 따옴표로 감싸지 않는다.
 * 기록은 `XY <경로>\0` 하나씩이다(`--no-renames` 라 옛 경로가 뒤따르는 기록이 없다).
 */
export const parsePorcelain = (out: string): VaultChangeMap => {
  const map: VaultChangeMap = {}
  for (const field of out.split('\0')) {
    if (field.length < 4) continue
    const meaning = meaningOf(field.slice(0, 2))
    const rel = field.slice(3)
    if (meaning !== null && rel !== '') map[rel] = meaning
  }
  return map
}

/**
 * `-uall`: 미추적 폴더를 `?? 새 폴더/` 한 줄로 접지 않는다 — 접으면 갓 만든 폴더 안의 파일에
 * 배지가 하나도 안 붙고, 그 키는 어떤 트리 행과도 맞지 않는다.
 * `--no-renames`: 이름 바뀜을 지움+새 파일로 풀어 파서가 기록 하나만 보면 되게 한다.
 */
const STATUS_ARGS = ['status', '--porcelain=v1', '-z', '-uall', '--no-renames']

/**
 * 비동기로 읽는다 — 저장할 때마다 타는 길이라 동기 `git()` 이면 파일 수천 개 보관함에서
 * main 프로세스가 `git status` 가 끝날 때까지 멈춘다(그 사이 창이 안 그려진다).
 */
const runStatus = (vaultDir: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const { file, env } = gitRuntime()
    execFile(
      file,
      STATUS_ARGS,
      // 시간 제한이 없으면 끝나지 않는 git 이 `withVaultGit` 줄을 쥔 채 그 보관함의 저장·받기를
      // 뒤에 영영 세운다. 넘기면 error 로 와 아래 catch 가 빈 맵으로 받는다
      {
        cwd: vaultDir,
        env,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 32 * 1024 * 1024
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout))
    )
  })

/**
 * 보관함에서 달라진 파일 목록. 받기·저장 커밋과 같은 줄에 선다 — 병합 도중에 읽으면 반쯤 얹힌
 * 상태를 본다. git 저장소가 아니거나(USB 로 옮겨 온 보관함) git 이 실패하면 빈 맵이다:
 * 배지는 보조 표기라 조용히 사라지는 쪽이 맞다
 */
export const readVaultChanges = (vaultDir: string): Promise<VaultChangeMap> =>
  withVaultGit(vaultDir, async () => {
    try {
      return parsePorcelain(await runStatus(vaultDir))
    } catch (error) {
      console.error('could not read the changed file list', vaultDir, error)
      return {}
    }
  })
