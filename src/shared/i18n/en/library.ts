import type { library as ko } from '../ko/library'

const ordinal = (n: string): string => {
  const v = Number(n)
  const tens = v % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][v % 10] ?? 'th'}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const library: typeof ko = {
  kind: {
    all: 'All',
    doc: 'Pages',
    pdf: 'PDF',
    image: 'Images',
    html: 'HTML',
    other: 'Other'
  },
  kindGroup: 'Kind to find',
  noKindMatch: 'Nothing found of this kind',
  fileNew: 'New file',
  fileChanged: 'Changed file',
  folderChanged: 'Something inside changed',
  root: { raw: 'Originals', Clippings: 'Waiting to wikify', wiki: 'Wiki' },
  badgeApprovals: 'To approve',
  badgeItems: 'To review',
  badgeClippings: 'Sources',
  runThis: 'This wiki draft',
  runDate: (month: number, day: number): string =>
    `${MONTHS[month - 1] ?? month} ${day} wiki draft`,
  runRepeat: (date: string, repeat: string): string => `${date} (${ordinal(repeat)})`,
  nodePage: 'Page',
  nodeSystem: 'Library housekeeping page',
  nodeGhost: "Page that doesn't exist yet",
  nodeSystemLabel: (label: string): string => `${label} (library housekeeping page)`,
  linksAtMost: (n: number): string => `${n} or fewer`,
  linksAbout: (n: number): string => `about ${n}`,
  linksAtLeast: (n: number): string => `${n} or more`,
  links: (n: number): string => `${n}`,
  sampleFailed: "Couldn't add the example source"
}
