import { ChatContext } from './chat-context'
import { useChatSession } from './use-chat-session'

export const ChatProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
  <ChatContext.Provider value={useChatSession()}>{children}</ChatContext.Provider>
)
