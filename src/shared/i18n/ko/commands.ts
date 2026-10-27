// 명령 표 이름(renderer lib/commands.ts)과 채팅 `/` 명령(lib/chat-commands.ts)
export const commands = {
  palette: '문서 찾아 열기',
  paletteCommands: '명령 팔레트',
  today: '오늘 노트 열기',
  randomPage: '아무 위키 페이지나 열기',
  ask: '묻기',
  chatToggle: '채팅 칸 여닫기',
  find: '본문에서 찾기',
  back: '뒤로',
  forward: '앞으로',
  tabNew: '새 탭',
  noteNew: '새 탭',
  tabClose: '이 탭 닫기',
  tabPrev: '왼쪽 탭',
  tabNext: '오른쪽 탭',
  tabN: (n: number): string => `${n}번째 탭으로`,
  tabLast: '마지막 탭으로'
}
