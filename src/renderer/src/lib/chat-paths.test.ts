// 채팅 답의 인라인 코드가 보관함 파일을 가리키는가 — 보관함에 있는 파일만 링크가 된다.
import { describe, expect, it } from 'vitest'
import { vaultFileIndex, vaultPathIn } from './chat-paths'

const files = vaultFileIndex(['outputs/report.html', 'wiki/개념/머신러닝.md', 'README.md'])

describe('vaultPathIn', () => {
  it('보관함에 있는 상대경로는 그대로 돌려준다', () => {
    expect(vaultPathIn('outputs/report.html', files)).toBe('outputs/report.html')
    expect(vaultPathIn(' ./wiki/개념/머신러닝.md ', files)).toBe('wiki/개념/머신러닝.md')
    expect(vaultPathIn('README.md', files)).toBe('README.md')
  })

  it('절대경로·홈 경로는 꼬리가 보관함 파일과 맞을 때만 잡는다', () => {
    expect(vaultPathIn('/Users/tak/vault/outputs/report.html', files)).toBe('outputs/report.html')
    expect(vaultPathIn('~/vault/wiki/개념/머신러닝.md', files)).toBe('wiki/개념/머신러닝.md')
    expect(vaultPathIn('C:\\Users\\tak\\vault\\outputs\\report.html', files)).toBe(
      'outputs/report.html'
    )
    expect(vaultPathIn('/etc/hosts', files)).toBeNull()
  })

  it('꼬리가 둘 맞으면 긴 쪽이다', () => {
    const nested = vaultFileIndex(['outputs/report.html', 'projects/a/outputs/report.html'])
    expect(vaultPathIn('/Users/tak/vault/projects/a/outputs/report.html', nested)).toBe(
      'projects/a/outputs/report.html'
    )
  })

  it('디스크에 풀어 쓴 꼴(NFD)로 남은 한글 이름도 합친 꼴로 적은 경로와 맞고, 돌려주는 것은 디스크의 경로다', () => {
    const onDisk = 'wiki/머신러닝.md'.normalize('NFD')
    expect(onDisk).not.toBe('wiki/머신러닝.md')
    expect(vaultPathIn('wiki/머신러닝.md', vaultFileIndex([onDisk]))).toBe(onDisk)
  })

  it('보관함에 없는 경로·명령·그냥 낱말은 링크가 되지 않는다', () => {
    expect(vaultPathIn('outputs/없는-파일.html', files)).toBeNull()
    expect(vaultPathIn('open outputs/report.html', files)).toBeNull()
    expect(vaultPathIn('report.html', files)).toBeNull()
    expect(vaultPathIn('outputs', files)).toBeNull()
    expect(vaultPathIn('', files)).toBeNull()
  })

  it('보관함 밖으로 나가는 조각이 든 경로는 잡지 않는다', () => {
    expect(vaultPathIn('../vault/outputs/report.html', files)).toBeNull()
    expect(vaultPathIn('/Users/tak/../outputs/report.html', files)).toBeNull()
  })
})
