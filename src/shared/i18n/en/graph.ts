import type { graph as ko } from '../ko/graph'

export const graph: typeof ko = {
  title: 'Graph',
  description: 'See how your documents link to each other',
  failed: "Couldn't draw the graph",
  failedHint: 'Try drawing it again — if it keeps failing, check that your library is open',
  redraw: 'Redraw',
  redrawHint: 'Lay out the positions again from scratch',
  emptyTitle: 'No pages to draw yet',
  emptyHint: 'Once you have documents, how they link to each other is drawn here',
  loading: 'Drawing the graph…',
  pickFromList: 'Pick from the page list',
  weak: (n: number): string =>
    `${n} topic ${n === 1 ? 'cluster' : 'clusters'} barely linked to the rest`,
  kindGroup: 'Kinds of dots shown',
  kindHint: {
    page: 'Wiki page',
    system: 'A document that runs the wiki, like INDEX',
    ghost: "A page that is linked to but hasn't been made yet"
  },
  legendLabel: (least: string, most: string, mid: string): string =>
    `Links from ${least} to ${most}, middle ${mid}. Pages with more links look brighter`,
  legendHint: (mid: string): string => `Pages with more links look brighter · middle ${mid}`,
  legendLinks: 'Links',
  legendMid: '· middle',
  communityHint: (n: number): string =>
    `Show only a group of closely linked pages · top ${n} by size`,
  community: 'Topic cluster',
  communityAll: 'All',
  communityN: (n: number): string => `Topic cluster ${n}`,
  communityWeak: ' (loosely linked)',
  fit: 'Fit to view',
  fitHint: 'Fit the whole graph on screen',
  growth: 'Play growth',
  growthUnready: 'You can play it once every dot has settled',
  growthStop: 'Press to stop (D)',
  growthPlay: 'Show the wiki growing from one page to the whole (D)',
  canvas: 'Wiki page link graph (3D) — open the same pages from the page list below',
  demo: {
    heading: 'How the wiki grew',
    pages: 'pages',
    tally: (groups: number, born: number, total: number): string =>
      `${groups} ${groups === 1 ? 'group' : 'groups'} · ${born} / ${total} pages`,
    progress: 'Growth playback progress',
    done: 'Your whole brain, connected.',
    seed: 'It starts with a single thought.',
    link: 'Then, connections form.',
    branch: 'Thoughts become branches.',
    compound: 'Knowledge compounds.',
    shape: 'A second brain takes shape.'
  }
}
