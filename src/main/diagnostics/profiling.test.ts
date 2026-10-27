import { describe, expect, it } from 'vitest'
import { summarizeMetrics, traceFileName, tracesToPrune } from './profiling'

describe('summarizeMetrics', () => {
  it('프로세스마다 종류·pid·이름·CPU%·메모리 MB 로 줄이고 메모리 큰 순으로', () => {
    const rows = summarizeMetrics([
      {
        pid: 10,
        type: 'Browser',
        cpu: { percentCPUUsage: 1.234 },
        memory: { workingSetSize: 102_400 }
      },
      {
        pid: 20,
        type: 'Tab',
        name: 'renderer',
        cpu: { percentCPUUsage: 12.5 },
        memory: { workingSetSize: 307_200 }
      },
      { pid: 30, type: 'GPU', serviceName: 'gpu', cpu: {}, memory: {} }
    ])
    expect(rows).toEqual([
      { pid: 20, type: 'Tab', name: 'renderer', cpuPercent: 12.5, memoryMB: 300 },
      { pid: 10, type: 'Browser', name: '', cpuPercent: 1.2, memoryMB: 100 },
      { pid: 30, type: 'GPU', name: 'gpu', cpuPercent: 0, memoryMB: 0 }
    ])
  })
})

describe('tracesToPrune', () => {
  const at = (name: string, mtimeMs: number): { name: string; mtimeMs: number } => ({
    name,
    mtimeMs
  })

  it('최근 성능 기록 keep 개를 남기고 나머지를 고른다 — 다른 파일은 보지 않는다', () => {
    const files = [
      at('trace-1.json', 1),
      at('main.log', 0),
      at('trace-4.json', 4),
      at('trace-2.json', 2),
      at('trace-3.json', 3)
    ]
    expect(tracesToPrune(files, 2).sort()).toEqual(['trace-1.json', 'trace-2.json'])
  })

  it('keep 개 이하면 지울 것이 없다', () => {
    expect(tracesToPrune([at('trace-1.json', 1)])).toEqual([])
  })
})

describe('traceFileName', () => {
  it('같은 초에 이미 있으면 번호를 붙여 앞 기록을 덮지 않는다', () => {
    const taken = new Set(['trace-20261024-130000.json', 'trace-20261024-130000-2.json'])
    const has = (name: string): boolean => taken.has(name)
    expect(traceFileName('20261024-130001', has)).toBe('trace-20261024-130001.json')
    expect(traceFileName('20261024-130000', has)).toBe('trace-20261024-130000-3.json')
  })
})
