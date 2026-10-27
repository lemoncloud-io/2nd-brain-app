import type { verifyDefect as ko } from '../ko/verify-defect'

export const verifyDefect: typeof ko = {
  tabIndent: 'The properties block is indented with tabs. Replace them with spaces',
  duplicateKey: 'The properties block has the same name twice. Keep only one',
  listUnderValue:
    'A list is attached under a property that already has a value. Keep only one of them',
  frontmatter: "Couldn't read the properties block at the top of the page. Check its format",
  nextActionJoined: 'One next-step line holds several items. Put one per line',
  nextActionLong: 'A next-step line is too long. Move the details into the body',
  nextActionShape:
    "Don't group next steps in one field or spread one over several lines. Write a single line, or a list with one per line",
  memoryMissing: 'The library memory file is missing. Run wikify again',
  memoryLong: 'The library memory file is too long. Move the details into the progress log',
  memoryRepeated: 'The library memory file has the same line more than once. Keep only one',
  memoryLineLong:
    'A line in the library memory file is too long. Move the details into the progress log',
  runLogMissing: "This run's progress log wasn't saved. Run wikify again",
  originalChanged: "An original file changed. Originals can't be edited, so undo that change",
  fallback: 'Open the page to check the problem'
}
