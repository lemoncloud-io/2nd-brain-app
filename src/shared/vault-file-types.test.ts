import { describe, it, expect } from 'vitest'
import { extOf, fileKind, isTextFile, mimeOf, isStreamed, vaultUrl } from './vault-file-types'

describe('extOf', () => {
  it('소문자 확장자를 돌려준다', () => {
    expect(extOf('wiki/A.PNG')).toBe('.png')
    expect(extOf('a/b/c.tar.gz')).toBe('.gz')
  })

  it('확장자가 없거나 숨김 파일이면 빈 문자열', () => {
    expect(extOf('wiki/README')).toBe('')
    expect(extOf('.gitignore')).toBe('')
  })
})

describe('fileKind', () => {
  it('Obsidian 이 여는 형식을 종류로 가른다', () => {
    expect(fileKind('a.md')).toBe('markdown')
    expect(fileKind('a.txt')).toBe('text')
    expect(fileKind('a.avif')).toBe('image')
    expect(fileKind('a.bmp')).toBe('image')
    expect(fileKind('a.jpg')).toBe('image')
    expect(fileKind('a.jpeg')).toBe('image')
    expect(fileKind('a.mp3')).toBe('audio')
    expect(fileKind('a.flac')).toBe('audio')
    expect(fileKind('a.mp4')).toBe('video')
    expect(fileKind('a.mkv')).toBe('video')
    expect(fileKind('a.pdf')).toBe('pdf')
    expect(fileKind('a.json')).toBe('json')
    expect(fileKind('a.html')).toBe('html')
    expect(fileKind('a.base')).toBe('base')
    expect(fileKind('a.canvas')).toBe('canvas')
  })

  it('소리만 든 webm 도 video 로 둔다 — video 요소가 둘 다 재생한다', () => {
    expect(fileKind('a.webm')).toBe('video')
  })

  it('코드·설정·기록 형식은 code 로 읽는다 — test: vault-file-types code', () => {
    for (const ext of [
      '.js',
      '.mjs',
      '.cjs',
      '.jsx',
      '.ts',
      '.mts',
      '.cts',
      '.tsx',
      '.sql',
      '.css',
      '.scss',
      '.less',
      '.xml',
      '.yml',
      '.yaml',
      '.toml',
      '.ini',
      '.cfg',
      '.conf',
      '.csv',
      '.tsv',
      '.log',
      '.sh',
      '.bash',
      '.zsh',
      '.py',
      '.rb',
      '.php',
      '.java',
      '.c',
      '.h',
      '.cpp',
      '.hpp',
      '.cc',
      '.go',
      '.rs',
      '.swift',
      '.kt',
      '.kts',
      '.vue',
      '.svelte',
      '.r',
      '.lua',
      '.pl',
      '.ps1'
    ]) {
      expect(fileKind(`a${ext}`)).toBe('code')
    }
    expect(fileKind('A.SQL')).toBe('code')
  })

  it('mdx·markdown 은 문서, jsonl·diff·patch 는 코드로 읽는다', () => {
    expect(fileKind('a.mdx')).toBe('markdown')
    expect(fileKind('a.markdown')).toBe('markdown')
    for (const ext of ['.jsonl', '.ndjson', '.diff', '.patch']) {
      expect(fileKind(`a${ext}`)).toBe('code')
    }
  })

  it('워드·파워포인트는 office — 미리보기가 HTML 로 바꿔 보인다', () => {
    expect(fileKind('a.docx')).toBe('office')
    expect(fileKind('A.PPTX')).toBe('office')
  })

  it('모르는 형식은 other', () => {
    expect(fileKind('a.xlsx')).toBe('other')
    expect(fileKind('README')).toBe('other')
  })
})

describe('mimeOf', () => {
  it('서브할 수 있는 형식은 Content-Type', () => {
    expect(mimeOf('a.md')).toContain('text/markdown')
    expect(mimeOf('a.mp4')).toBe('video/mp4')
    expect(mimeOf('a.mp3')).toBe('audio/mpeg')
  })

  it('json·html·code 는 글자로만 내준다 — 볼트 html 이 곧 페이지가 되지 않는다', () => {
    expect(mimeOf('a.json')).toBe('text/plain; charset=utf-8')
    expect(mimeOf('a.html')).toBe('text/plain; charset=utf-8')
    expect(mimeOf('a.htm')).toBe('text/plain; charset=utf-8')
    expect(mimeOf('a.js')).toBe('text/plain; charset=utf-8')
    expect(mimeOf('a.sql')).toBe('text/plain; charset=utf-8')
  })

  it('.base·.canvas·워드·파워포인트·모르는 형식은 null — 원본 바이트를 vault:// 로 내주지 않는다', () => {
    expect(mimeOf('a.base')).toBeNull()
    expect(mimeOf('a.canvas')).toBeNull()
    expect(mimeOf('a.docx')).toBeNull()
    expect(mimeOf('a.pptx')).toBeNull()
    expect(mimeOf('a.xlsx')).toBeNull()
  })
})

describe('isStreamed', () => {
  it('소리·영상만 흘려보낸다', () => {
    expect(isStreamed('a.mp3')).toBe(true)
    expect(isStreamed('a.mp4')).toBe(true)
    expect(isStreamed('a.png')).toBe(false)
    expect(isStreamed('a.pdf')).toBe(false)
  })
})

describe('vaultUrl', () => {
  it('한글·공백 경로를 인코딩한다', () => {
    expect(vaultUrl('raw/사진 1.png')).toBe('vault://local/raw/%EC%82%AC%EC%A7%84%201.png')
  })

  it('#·? 파일명이 프래그먼트·쿼리로 잘리지 않고 왕복한다', () => {
    for (const rel of ['raw/a#b.md', 'raw/a?b.md', 'raw/a&b.md']) {
      const url = new URL(vaultUrl(rel))
      expect(url.pathname).toBe(`/${rel.split('/').map(encodeURIComponent).join('/')}`)
      expect(decodeURIComponent(url.pathname).replace(/^\//, '')).toBe(rel)
    }
  })
})

describe('isTextFile', () => {
  it('문서·글·코드·json·html 은 글자 파일이다 — 기록을 줄로 견줄 수 있다', () => {
    for (const rel of ['a.md', 'a.txt', 'a.ts', 'a.json', 'a.HTML', 'a.htm']) {
      expect(isTextFile(rel)).toBe(true)
    }
  })

  it('그림(svg 포함)·소리·영상·PDF·그 밖은 아니다', () => {
    for (const rel of [
      'a.png',
      'a.svg',
      'a.mp3',
      'a.mp4',
      'a.pdf',
      'a.base',
      'a.canvas',
      'a.zip'
    ]) {
      expect(isTextFile(rel)).toBe(false)
    }
  })
})

describe('windows path edge', () => {
  it('백슬래시·대문자 확장자도 가린다', () => {
    expect(extOf('C:\\v\\A.MD')).toBe('.md')
    expect(fileKind('C:\\v\\song.MP3')).toBe('audio')
    // html 도 글자로만 내준다 — vault:// 에서 실행 가능한 문서로 열지 않는다
    expect(mimeOf('C:\\v\\PAGE.HTML')).toBe('text/plain; charset=utf-8')
  })
})
