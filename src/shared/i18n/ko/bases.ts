import { josa } from '../../josa'

// `.base` 표 계산이 멈춘 이유(shared/bases)
export const bases = {
  regexUnclosed: (input: string): string => `정규식이 닫히지 않았어요: ${input}`,
  quoteUnclosed: (input: string): string => `따옴표가 닫히지 않았어요: ${input}`,
  unknownChar: (c: string): string => `이 앱이 모르는 글자예요: ${c}`,
  unknownFileProp: (prop: string): string => `이 앱이 모르는 파일 속성이에요: file.${prop}`,
  unknownFunction: (call: string): string => `이 앱이 모르는 함수예요: ${call}`,
  needsArgument: (fn: string): string => `비교할 말이 없어요: ${fn}()에는 인자가 하나 필요해요`,
  unreadToEnd: (input: string): string => `끝까지 읽지 못했어요: ${input}`,
  expected: (text: string): string => `${josa(text, '이/가')} 있어야 해요`,
  unknownProperty: (name: string): string => `이 앱이 모르는 속성이에요: .${name}`,
  cutShort: '식이 중간에 끊겼어요',
  unexpectedChar: (text: string): string => `여기 올 수 없는 글자예요: ${text}`,
  noteIndexQuoted: 'note[…] 안에는 따옴표 친 이름만 올 수 있어요',
  missingFormula: (name: string): string => `이 파일에 없는 수식이에요: formula.${name}`,
  formulaCycle: (name: string): string => `수식이 서로를 불러요: formula.${name}`,
  needsPropertyName: '속성 이름이 있어야 해요',
  filterShape: '필터 모양을 알 수 없어요',
  unknownFilter: (keys: string): string => `이 앱이 모르는 필터예요: ${keys}`,
  needsList: (key: string): string => `${key} 아래에는 목록이 와야 해요`,
  nameColumn: '이름',
  unknownDirection: (where: string, value: string): string =>
    `이 앱이 모르는 ${where} 방향이에요: ${value}`,
  unknownSetting: (where: string, keys: string): string =>
    `이 앱이 모르는 ${where} 설정이에요: ${keys}`,
  needsProperty: (where: string): string => `${where}에는 property가 있어야 해요`,
  unreadable: (reason: string): string => `이 파일을 읽지 못했어요 — ${reason}`,
  noTables: '이 파일에는 표가 없어요',
  tableN: (n: number): string => `표 ${n}`,
  unknownViewType: '모름',
  tablesOnly: (type: string): string =>
    `이 앱은 표만 그릴 수 있어요. 이 보기(${type})는 Obsidian에서 봐 주세요`,
  unknownViewKeys: (keys: string): string =>
    `이 앱이 모르는 표 설정이에요(${keys}). Obsidian에서 봐 주세요`,
  seeInObsidian: (reason: string): string => `${reason}. Obsidian에서 봐 주세요`
}
