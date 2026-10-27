// 팔레트·찾기·지식 관리 진입 — 작은 신호들. 중앙 이동은 document 슬라이스가 맡는다.
import type { StateCreator } from 'zustand'
import type { WorkbenchState } from './workbench'

/** 지식 관리 한 페이지 안의 구역 — 매일 쓰지 않는 것을 한곳에 모았다 */
export type KnowledgeSection = 'sources' | 'lint' | 'review' | 'graph' | 'search'

export interface OverlaySlice {
  /** 지식 관리에서 열린 구역 */
  knowledgeSection: KnowledgeSection
  /** 지식 관리의 그 구역을 연다 */
  openKnowledge: (section: KnowledgeSection) => void
  /** ⌘K 팔레트(`components/palette.tsx`) — 문서 찾기가 기본, 입력이 `>` 로 시작하면 명령(표는 `lib/commands.ts`) */
  paletteOpen: boolean
  /** 열릴 때 입력칸에 미리 채우는 글자 — ⌘K 는 '', ⌘P 는 '>' */
  paletteSeed: string
  openPalette: (seed: string) => void
  /** 리더 찾기 띠(⌘F)가 열린 페이지 — 다른 페이지로 가면 저절로 접힌다. 편집기는 CodeMirror 가 제 패널을 연다 */
  findFor: string | null
  setFindFor: (rel: string | null) => void
  setPaletteOpen: (open: boolean) => void
  /** ⌘K 의 "본문에서 찾기" — 검색 뷰가 이 질의를 받아 바로 찾는다(`at` 이 바뀔 때마다) */
  searchRequest: { query: string; at: number } | null
  searchText: (query: string) => void
  /** 시작하기를 어디서 열었는지 — 설정에서 다시 보기했을 때만 돌아가는 단추가 있다 */
  startFrom: 'settings' | null
  setStartFrom: (from: 'settings' | null) => void
  /** 설정의 "처음 안내 다시 보기" — 돌아올 길을 남기고 시작하기로 간다 */
  reopenStart: () => void
}

export const createOverlaySlice: StateCreator<WorkbenchState, [], [], OverlaySlice> = (
  set,
  get
) => ({
  knowledgeSection: 'sources',
  openKnowledge: (knowledgeSection) => {
    set({ knowledgeSection })
    get().setView('knowledge')
  },
  paletteOpen: false,
  paletteSeed: '',
  openPalette: (paletteSeed) => set({ paletteOpen: true, paletteSeed }),
  findFor: null,
  setFindFor: (findFor) => set({ findFor }),
  // 닫으면 미리 채울 글자도 지운다 — 다음에 열 때 직전 모드가 남지 않게
  setPaletteOpen: (paletteOpen) =>
    set(paletteOpen ? { paletteOpen } : { paletteOpen, paletteSeed: '' }),
  searchRequest: null,
  searchText: (query) => {
    set({ searchRequest: { query, at: Date.now() } })
    get().openKnowledge('search')
  },
  startFrom: null,
  setStartFrom: (startFrom) => set({ startFrom }),
  reopenStart: () => {
    set({ startFrom: 'settings' })
    get().setView('start')
  }
})
