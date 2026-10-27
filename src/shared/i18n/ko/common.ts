// 여러 화면이 같이 쓰는 문구 — 같은 뜻의 문장을 영역마다 따로 두지 않는다
export const common = {
  saveSettingFailed: '이 설정을 저장하지 못했어요',
  noVault: '열린 자료 보관함이 없어요',
  /** 몇 분씩 걸리는 작업의 경과 시간 */
  elapsed: (seconds: number): string =>
    seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${seconds % 60}초`,
  /** 경과 시간 뒤에 붙는 말 — time 은 formatElapsed 결과 */
  passed: (time: string): string => `${time} 지남`
}
