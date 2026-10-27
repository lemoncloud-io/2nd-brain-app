// 채팅 IPC 실패 한 줄 — 원문을 가려 사용자 말로 돌려준다.
// 못 가리면(unknown) 연결 확인 문장 그대로다. 같은 문장 4벌을 한 곳에 둔다.
// electron 없이 테스트한다 — chat-handlers 는 이 함수만 쓴다
import { describeEngineFailure } from '../../shared/engine-failure'
import { mainT } from '../i18n'

export const chatFailed = (label: string, error: unknown): { error: string } => {
  const raw = error instanceof Error ? error.message : String(error)
  console.error(label, error)
  return {
    error: describeEngineFailure(raw, mainT().chatService.runFailedPress)
  }
}
