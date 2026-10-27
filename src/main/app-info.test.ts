import { describe, expect, it } from 'vitest'
import { buildAppInfo } from './app-info'

describe('buildAppInfo', () => {
  it('전달한 버전·플랫폼·electron 버전을 그대로 노출한다', () => {
    const info = buildAppInfo({
      version: '1.2.3',
      platform: 'darwin',
      electronVersion: '44.0.0'
    })
    expect(info).toEqual({
      version: '1.2.3',
      platform: 'darwin',
      electronVersion: '44.0.0'
    })
  })
})
