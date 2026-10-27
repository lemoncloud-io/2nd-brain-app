import type { bases as ko } from '../ko/bases'

export const bases: typeof ko = {
  regexUnclosed: (input: string): string => `A regular expression isn't closed: ${input}`,
  quoteUnclosed: (input: string): string => `A quote isn't closed: ${input}`,
  unknownChar: (c: string): string => `This app doesn't know this character: ${c}`,
  unknownFileProp: (prop: string): string =>
    `This app doesn't know this file property: file.${prop}`,
  unknownFunction: (call: string): string => `This app doesn't know this function: ${call}`,
  needsArgument: (fn: string): string => `Nothing to compare: ${fn}() needs one argument`,
  unreadToEnd: (input: string): string => `Couldn't read to the end: ${input}`,
  expected: (text: string): string => `Expected ${text}`,
  unknownProperty: (name: string): string => `This app doesn't know this property: .${name}`,
  cutShort: 'The expression ends too early',
  unexpectedChar: (text: string): string => `This character can't go here: ${text}`,
  noteIndexQuoted: 'Only a quoted name can go inside note[…]',
  missingFormula: (name: string): string => `This file has no such formula: formula.${name}`,
  formulaCycle: (name: string): string => `Formulas refer to each other: formula.${name}`,
  needsPropertyName: 'A property name is needed',
  filterShape: "Can't tell the shape of this filter",
  unknownFilter: (keys: string): string => `This app doesn't know this filter: ${keys}`,
  needsList: (key: string): string => `${key} must be followed by a list`,
  nameColumn: 'Name',
  unknownDirection: (where: string, value: string): string =>
    `This app doesn't know this ${where} direction: ${value}`,
  unknownSetting: (where: string, keys: string): string =>
    `This app doesn't know this ${where} setting: ${keys}`,
  needsProperty: (where: string): string => `${where} needs a property`,
  unreadable: (reason: string): string => `Couldn't read this file — ${reason}`,
  noTables: 'This file has no tables',
  tableN: (n: number): string => `Table ${n}`,
  unknownViewType: 'unknown',
  tablesOnly: (type: string): string =>
    `This app can only show tables. View this one (${type}) in Obsidian`,
  unknownViewKeys: (keys: string): string =>
    `This app doesn't know these table settings (${keys}). View it in Obsidian`,
  seeInObsidian: (reason: string): string => `${reason}. View it in Obsidian`
}
