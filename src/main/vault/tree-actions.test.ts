import { describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFolder, createNote, moveEntry, movableEntry, renameEntry } from './tree-actions'

const withDir = (body: (dir: string) => void): void => {
  const dir = mkdtempSync(join(tmpdir(), 'tree-actions-'))
  try {
    body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('createNote', () => {
  it('고른 폴더에 빈 노트를 만들고, 이름이 겹치면 번호를 붙인다', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'private'))
      expect(createNote(dir, 'private')).toEqual({ ok: true, rel: 'private/제목 없음.md' })
      expect(createNote(dir, 'private')).toEqual({ ok: true, rel: 'private/제목 없음 2.md' })
      expect(readFileSync(join(dir, 'private/제목 없음.md'), 'utf8')).toBe('')
    })
  })

  it('폴더를 고르지 않았으면 보관함 맨 위에 만든다', () => {
    withDir((dir) => {
      expect(createNote(dir, '')).toEqual({ ok: true, rel: '제목 없음.md' })
    })
  })

  it('보관함 밖·숨김 폴더·없는 폴더에는 만들지 않는다', () => {
    withDir((dir) => {
      mkdirSync(join(dir, '.obsidian'))
      expect(createNote(dir, '../x').ok).toBe(false)
      expect(createNote(dir, '.obsidian').ok).toBe(false)
      expect(createNote(dir, 'nope').ok).toBe(false)
      expect(existsSync(join(dir, '..', 'x'))).toBe(false)
    })
  })
})

describe('createFolder', () => {
  it('새 폴더를 만들고 겹치면 번호를 붙인다', () => {
    withDir((dir) => {
      expect(createFolder(dir, '')).toEqual({ ok: true, rel: '새 폴더' })
      expect(createFolder(dir, '')).toEqual({ ok: true, rel: '새 폴더 2' })
      expect(statSync(join(dir, '새 폴더')).isDirectory()).toBe(true)
      expect(createFolder(dir, '새 폴더')).toEqual({ ok: true, rel: '새 폴더/새 폴더' })
    })
  })
})

const seed = (dir: string): void => {
  mkdirSync(join(dir, 'private', 'old'), { recursive: true })
  mkdirSync(join(dir, 'raw'))
  writeFileSync(join(dir, 'private', 'plan.md'), '# 계획\n')
  writeFileSync(join(dir, 'raw', 'src.md'), '원본')
  writeFileSync(join(dir, 'VAULT_RULES.md'), '규칙')
}

describe('renameEntry', () => {
  it('확장자를 안 쳐도 원래 확장자를 붙이고 내용은 그대로다', () => {
    withDir((dir) => {
      seed(dir)
      expect(renameEntry(dir, 'private/plan.md', '  주간 계획 ')).toEqual({
        ok: true,
        rel: 'private/주간 계획.md'
      })
      expect(readFileSync(join(dir, 'private', '주간 계획.md'), 'utf8')).toBe('# 계획\n')
      expect(existsSync(join(dir, 'private', 'plan.md'))).toBe(false)
    })
  })

  it('폴더 이름도 바꾼다', () => {
    withDir((dir) => {
      seed(dir)
      expect(renameEntry(dir, 'private/old', '지난 것')).toEqual({
        ok: true,
        rel: 'private/지난 것'
      })
    })
  })

  it('겹치는 이름·경로 문자·숨김 이름은 거절하고 파일을 건드리지 않는다', () => {
    withDir((dir) => {
      seed(dir)
      writeFileSync(join(dir, 'private', 'b.md'), '')
      expect(renameEntry(dir, 'private/plan.md', 'b').ok).toBe(false)
      expect(renameEntry(dir, 'private/plan.md', '../x').ok).toBe(false)
      expect(renameEntry(dir, 'private/plan.md', '.hidden').ok).toBe(false)
      expect(renameEntry(dir, 'private/plan.md', '   ').ok).toBe(false)
      expect(existsSync(join(dir, 'private', 'plan.md'))).toBe(true)
    })
  })
})

describe('moveEntry', () => {
  it('다른 폴더로 옮기고 새 경로를 돌려준다', () => {
    withDir((dir) => {
      seed(dir)
      expect(moveEntry(dir, 'private/plan.md', 'private/old')).toEqual({
        ok: true,
        rel: 'private/old/plan.md'
      })
      expect(moveEntry(dir, 'private/old/plan.md', '')).toEqual({ ok: true, rel: 'plan.md' })
    })
  })

  it('자기 안으로·raw 로·겹치는 이름으로는 옮기지 않는다', () => {
    withDir((dir) => {
      seed(dir)
      writeFileSync(join(dir, 'private', 'old', 'plan.md'), '')
      expect(moveEntry(dir, 'private/old', 'private/old').ok).toBe(false)
      expect(moveEntry(dir, 'private', 'private/old').ok).toBe(false)
      expect(moveEntry(dir, 'private/plan.md', 'raw').ok).toBe(false)
      expect(moveEntry(dir, 'private/plan.md', 'private/old').ok).toBe(false)
      expect(readFileSync(join(dir, 'private', 'plan.md'), 'utf8')).toBe('# 계획\n')
    })
  })
})

describe('movableEntry', () => {
  it('보관함 뼈대 폴더·raw·규칙 파일·없는 항목·보관함 밖은 거절한다', () => {
    withDir((dir) => {
      seed(dir)
      expect(movableEntry(dir, 'private').ok).toBe(false)
      expect(movableEntry(dir, 'raw/src.md').ok).toBe(false)
      expect(movableEntry(dir, 'VAULT_RULES.md').ok).toBe(false)
      expect(movableEntry(dir, 'private/nope.md').ok).toBe(false)
      expect(movableEntry(dir, '../x').ok).toBe(false)
      expect(movableEntry(dir, 'private/plan.md').ok).toBe(true)
    })
  })
})

// 슬라이스 02 — 트리가 이름을 먼저 받아 만든다. 이름 없이 부르면 예전처럼 기본 이름이다
describe('이름을 받아 만들기', () => {
  it('노트를 친 이름으로 만든다', () => {
    withDir((dir) => {
      expect(createNote(dir, '', '회의록')).toEqual({ ok: true, rel: '회의록.md' })
      expect(existsSync(join(dir, '회의록.md'))).toBe(true)
    })
  })

  it('확장자를 안 쳤으면 노트에 .md 를 붙인다', () => {
    withDir((dir) => {
      expect(createNote(dir, '', '회의록.md')).toEqual({ ok: true, rel: '회의록.md' })
    })
  })

  it('폴더를 친 이름으로 만든다', () => {
    withDir((dir) => {
      expect(createFolder(dir, '', '기획')).toEqual({ ok: true, rel: '기획' })
      expect(statSync(join(dir, '기획')).isDirectory()).toBe(true)
    })
  })

  // 번호를 붙여 딴 이름으로 만들면 사용자가 친 것과 다른 것이 생긴다 — 이름 바꾸기와 같이 거절한다
  it('친 이름이 이미 있으면 번호를 붙이지 않고 거절한다', () => {
    withDir((dir) => {
      createNote(dir, '', '회의록')
      expect(createNote(dir, '', '회의록')).toEqual({
        ok: false,
        reason: '같은 자리에 "회의록.md"가 이미 있어요'
      })
      mkdirSync(join(dir, '기획'))
      expect(createFolder(dir, '', '기획')).toEqual({
        ok: false,
        reason: '같은 자리에 "기획"이 이미 있어요'
      })
    })
  })

  it('경로 문자·맨 앞 점·빈 이름은 거절한다', () => {
    withDir((dir) => {
      for (const bad of ['a/b', '.숨김', '  ', 'a:b', '..']) {
        expect(createNote(dir, '', bad).ok).toBe(false)
        expect(createFolder(dir, '', bad).ok).toBe(false)
      }
    })
  })

  it('이름을 주지 않으면 예전 기본 이름 그대로다', () => {
    withDir((dir) => {
      expect(createNote(dir, '')).toEqual({ ok: true, rel: '제목 없음.md' })
      expect(createFolder(dir, '')).toEqual({ ok: true, rel: '새 폴더' })
    })
  })
})

describe('확장자를 붙여 만들기', () => {
  it('앱이 여는 형식을 치면 그 형식 그대로 만든다', () => {
    withDir((dir) => {
      expect(createNote(dir, '', 'index.html')).toEqual({ ok: true, rel: 'index.html' })
      expect(createNote(dir, '', '메모.txt')).toEqual({ ok: true, rel: '메모.txt' })
      expect(createNote(dir, '', 'data.json')).toEqual({ ok: true, rel: 'data.json' })
      expect(existsSync(join(dir, 'index.html'))).toBe(true)
    })
  })

  // 점이 든 제목을 형식으로 받으면 아무 데서도 안 열리는 파일이 남는다
  it('모르는 꼬리는 형식이 아니다 — 점이 든 제목도 노트로 만든다', () => {
    withDir((dir) => {
      expect(createNote(dir, '', '회의 2026.09.21')).toEqual({
        ok: true,
        rel: '회의 2026.09.21.md'
      })
      expect(createNote(dir, '', 'setup.sh')).toEqual({ ok: true, rel: 'setup.sh.md' })
    })
  })

  // 0바이트 그림·PDF 는 만들어 봐야 깨진 미리보기다 — 앱 안에 채울 수단이 없다
  it('글로 채울 수 없는 형식은 노트로 만든다', () => {
    withDir((dir) => {
      expect(createNote(dir, '', 'shot.png')).toEqual({ ok: true, rel: 'shot.png.md' })
      expect(createNote(dir, '', 'clip.mp4')).toEqual({ ok: true, rel: 'clip.mp4.md' })
      expect(createNote(dir, '', '보고.pdf')).toEqual({ ok: true, rel: '보고.pdf.md' })
      expect(createNote(dir, '', 'view.base')).toEqual({ ok: true, rel: 'view.base.md' })
    })
  })

  it('폴더 이름의 점은 확장자로 다루지 않는다', () => {
    withDir((dir) => {
      expect(createFolder(dir, '', '2026.09')).toEqual({ ok: true, rel: '2026.09' })
    })
  })
})

describe('이름 바꾸기와 확장자', () => {
  it('확장자를 안 보여 준 이름은 원래 확장자를 지킨다', () => {
    withDir((dir) => {
      writeFileSync(join(dir, 'a.md'), '')
      expect(renameEntry(dir, 'a.md', '회의록')).toEqual({ ok: true, rel: '회의록.md' })
    })
  })

  it('확장자까지 보여 준 이름이면 형식을 바꿀 수 있다', () => {
    withDir((dir) => {
      writeFileSync(join(dir, 'a.md'), '')
      expect(renameEntry(dir, 'a.md', 'a.html', true)).toEqual({ ok: true, rel: 'a.html' })
      expect(existsSync(join(dir, 'a.html'))).toBe(true)
    })
  })

  // 확장자를 바꿀 수 있게 됐다고 보호 규칙이 풀리지는 않는다
  it('보호 자리는 확장자를 보여 줘도 그대로 막힌다', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'raw'))
      writeFileSync(join(dir, 'raw', 'x.md'), '')
      expect(renameEntry(dir, 'raw/x.md', 'x.html', true).ok).toBe(false)
      expect(renameEntry(dir, 'VAULT_RULES.md', 'rules.html', true).ok).toBe(false)
    })
  })
})
