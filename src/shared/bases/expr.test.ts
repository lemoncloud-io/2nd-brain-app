import { describe, it, expect } from 'vitest'
import { evaluateExpr, truthy, Unsupported, type BaseNote } from './expr'

const note: BaseNote = {
  rel: 'projects/lemon/README.md',
  basename: 'README',
  folder: 'projects/lemon',
  props: { type: 'project', status: 'active', tags: ['일', '#급함'], 수: 3, repo: '' },
  mtimeMs: Date.UTC(2026, 8, 20),
  size: 1234
}

const run = (input: string, on: BaseNote = note): unknown => evaluateExpr(input, on)

describe('evaluateExpr 의 리터럴과 속성', () => {
  it('frontmatter 속성은 이름만으로도, note. 로도 읽는다', () => {
    expect(run('type')).toBe('project')
    expect(run('note.type')).toBe('project')
    expect(run('note["type"]')).toBe('project')
  })

  it('없는 속성은 null', () => {
    expect(run('없는것')).toBeNull()
    expect(run('note.없는것')).toBeNull()
  })

  it('파일 속성을 읽는다 — 이름은 갈 곳을 달고 온다', () => {
    expect(run('file.name')).toEqual({ rel: 'projects/lemon/README.md', text: 'README.md' })
    expect(run('file.basename')).toBe('README')
    expect(run('file.path')).toBe('projects/lemon/README.md')
    expect(run('file.folder')).toBe('projects/lemon')
    expect(run('file.ext')).toBe('md')
    expect(run('file.size')).toBe(1234)
    expect(run('file.mtime')).toEqual(new Date(Date.UTC(2026, 8, 20)))
  })

  it('때·크기를 모르는 노트는 null 이다', () => {
    const bare: BaseNote = { rel: 'a.md', basename: 'a', folder: '', props: {} }
    expect(run('file.mtime', bare)).toBeNull()
    expect(run('file.size', bare)).toBeNull()
  })
})

describe('evaluateExpr 의 견주기', () => {
  it('같다·다르다', () => {
    expect(run('type == "project"')).toBe(true)
    expect(run("type == 'project'")).toBe(true)
    expect(run('type != "idea"')).toBe(true)
    expect(run('수 == 3')).toBe(true)
  })

  it('없는 속성은 어떤 값과도 다르다 — status 가 없는 노트도 "done 아님" 에 든다', () => {
    const bare: BaseNote = { rel: 'a.md', basename: 'a', folder: '', props: {} }
    expect(run('status != "done"', bare)).toBe(true)
    expect(run('status == "done"', bare)).toBe(false)
  })

  it('크기 비교는 같은 종류끼리만 — 섞이면 거짓', () => {
    expect(run('수 > 2')).toBe(true)
    expect(run('수 <= 3')).toBe(true)
    expect(run('수 > "2"')).toBe(false)
    expect(run('없는것 > 1')).toBe(false)
  })
})

describe('evaluateExpr 의 논리와 함수', () => {
  it('!·&&·||·괄호', () => {
    expect(run('!(type == "idea")')).toBe(true)
    expect(run('type == "project" && status == "active"')).toBe(true)
    expect(run('type == "idea" || status == "active"')).toBe(true)
  })

  it('inFolder 는 그 폴더와 하위 전부', () => {
    expect(run('file.inFolder("projects")')).toBe(true)
    expect(run('file.inFolder("projects/lemon")')).toBe(true)
    expect(run('file.inFolder("templates")')).toBe(false)
    expect(run('!file.inFolder("templates")')).toBe(true)
  })

  it('hasTag 는 # 을 무시하고 견준다', () => {
    expect(run('file.hasTag("일")')).toBe(true)
    expect(run('file.hasTag("급함")')).toBe(true)
    expect(run('file.hasTag("없는태그")')).toBe(false)
    expect(run('file.hasTag("없는태그", "일")')).toBe(true)
  })

  it('중첩 태그는 그 이름 그대로만 센다 — 위 태그로는 잡히지 않는다', () => {
    const nested: BaseNote = {
      rel: 'a.md',
      basename: 'a',
      folder: '',
      props: { tags: ['일/급함'] }
    }
    expect(run('file.hasTag("일/급함")', nested)).toBe(true)
    expect(run('file.hasTag("일")', nested)).toBe(false)
  })

  it('hasProperty 는 값이 아니라 있고 없음을 본다', () => {
    expect(run('file.hasProperty("status")')).toBe(true)
    expect(run('file.hasProperty("없는것")')).toBe(false)
  })
})

describe('evaluateExpr 가 모르는 것', () => {
  const rejects = [
    'formula.price',
    'price.toFixed(2)',
    'file.hasLink("Note")',
    'file.ctime',
    'date("2026-01-01")',
    'status.nope()',
    'status.length',
    'formula.없는것',
    'if(price, 1, 2)',
    'type == ',
    'type == "열린 따옴표',
    'type @ 3'
  ]

  for (const input of rejects) {
    it(`거절한다: ${input}`, () => {
      expect(() => run(input)).toThrow(Unsupported)
    })
  }
})

describe('evaluateExpr 의 값 메서드', () => {
  it('isEmpty 는 없음·빈 글자·빈 목록만 비었다고 본다 — 0 은 값이다', () => {
    expect(run('repo.isEmpty()')).toBe(true)
    expect(run('!repo.isEmpty()')).toBe(false)
    expect(run('status.isEmpty()')).toBe(false)
    expect(run('없는것.isEmpty()')).toBe(true)
    expect(run('수.isEmpty()')).toBe(false)
  })

  it('정규식으로 글자를 바꾼다 — 수식이 폴더 이름만 떼는 데 쓴다', () => {
    expect(run('file.folder.replace(/^.*\\//, "")')).toBe('lemon')
    expect(run('status.replace("act", "AC")')).toBe('ACive')
  })

  it('글자 다루기', () => {
    expect(run('status.startsWith("act")')).toBe(true)
    expect(run('status.endsWith("ve")')).toBe(true)
    expect(run('status.toUpperCase()')).toBe('ACTIVE')
    expect(run('tags.contains("일")')).toBe(true)
    expect(run('tags.contains("없음")')).toBe(false)
  })

  it('인자 없는 contains·startsWith·endsWith는 조용히 참 대신 모른다고 말한다', () => {
    expect(() => run('type.contains()')).toThrow(Unsupported)
    expect(() => run('type.startsWith()')).toThrow(Unsupported)
    expect(() => run('type.endsWith()')).toThrow(Unsupported)
  })
})

describe('evaluateExpr 의 link 와 수식', () => {
  it('link 는 갈 곳과 보일 글자를 만든다', () => {
    expect(run('link(file.path, "보일 글")')).toEqual({
      rel: 'projects/lemon/README.md',
      text: '보일 글'
    })
    expect(run('link(file.path)')).toEqual({
      rel: 'projects/lemon/README.md',
      text: 'projects/lemon/README.md'
    })
  })

  it('formula.<이름> 은 그 파일의 수식을 이 노트에 대고 푼다', () => {
    const formulas = { project: 'link(file.path, file.folder.replace(/^.*\\//, ""))' }
    expect(evaluateExpr('formula.project', note, { formulas })).toEqual({
      rel: 'projects/lemon/README.md',
      text: 'lemon'
    })
  })

  it('수식이 서로를 부르면 멈춘다', () => {
    const formulas = { a: 'formula.b', b: 'formula.a' }
    expect(() => evaluateExpr('formula.a', note, { formulas })).toThrow(Unsupported)
  })
})

describe('truthy', () => {
  it('빈 값은 거짓', () => {
    expect(truthy('')).toBe(false)
    expect(truthy(0)).toBe(false)
    expect(truthy([])).toBe(false)
    expect(truthy(null)).toBe(false)
    expect(truthy(undefined)).toBe(false)
  })

  it('채워진 값은 참', () => {
    expect(truthy('글')).toBe(true)
    expect(truthy(3)).toBe(true)
    expect(truthy(['가'])).toBe(true)
  })
})
