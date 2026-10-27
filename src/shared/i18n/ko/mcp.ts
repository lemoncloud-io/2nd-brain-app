// 도구 서버(MCP) 설정 검사(shared/mcp-servers.ts)
export const mcp = {
  unreadable: '서버 설정을 읽지 못했어요',
  badName: '이름은 영문·숫자·-·_로 40자 안에서 지어 주세요',
  noCommand: '실행할 명령을 적어 주세요',
  badUrl: '주소는 http:// 나 https://로 시작해야 해요',
  notJson: 'JSON으로 읽지 못했어요. 문서의 설정 조각을 그대로 붙여 넣어 주세요',
  noServersKey: '"mcpServers" 아래에 서버 이름별 설정이 있어야 해요',
  empty: '서버가 하나도 없어요'
}
