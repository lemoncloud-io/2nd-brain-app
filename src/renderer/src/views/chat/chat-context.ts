// 채팅 세션은 앱에 하나뿐이다 — 어디서 열어도 같은 대화·같은 스트림을 본다.
// 두 벌을 만들면 한쪽에서 답이 오는 동안 다른 쪽이 빈 화면이 된다.
import { createContext, useContext } from 'react'
import type { ChatSession } from './use-chat-session'

export const ChatContext = createContext<ChatSession | null>(null)

export const useChat = (): ChatSession => {
  const session = useContext(ChatContext)
  if (!session) throw new Error('useChat must be used inside ChatProvider')
  return session
}
