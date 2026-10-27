import type { wiki as ko } from '../ko/wiki'

export const wiki: typeof ko = {
  orphan: 'No pages link here',
  noOutlinks: "This page doesn't link anywhere",
  frontmatterNotMap: "The properties block at the top isn't in name: value form",
  badPropertyName: "Property names can't contain :, # or line breaks",
  frontmatterUnreadableFix: "Couldn't read the properties block at the top. Fix it in the source",
  frontmatterNotMapFix:
    "The properties block at the top isn't in name: value form. Fix it in the source",
  mergeAliasFailed: (reason: string): string => `Couldn't add the old name as an alias: ${reason}`,
  changedMidway:
    "The page changed while you were viewing it, so the changes couldn't be marked. Reopen the page to see them again"
}
