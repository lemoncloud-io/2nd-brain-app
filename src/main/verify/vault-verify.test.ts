import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createVault } from '../vault/vault-service'
import { vaultKitPath } from '../paths'
import { scanFrontmatter, scanNextAction, verifyVault, type VerifyLane } from './vault-verify'
import { computeVolume, formatVolumeLine, writeVolumeLine } from './vault-volume'

const RUN_LOG = [
  '---',
  'type: run-log',
  'kind: ingest',
  'run_date: "2026-09-14"',
  'author: tester',
  'summary: "fake ingest"',
  'pr:',
  'processed: 1',
  'new_notes: 1',
  'updated_notes: 0',
  'tags: []',
  'sources: []',
  'notes: []',
  '---',
  '',
  '# Ingest',
  ''
].join('\n')

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

const write = (dir: string, rel: string, text: string): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}

const commit = (dir: string, message: string): void => {
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', message)
}

const withVault = (body: (dir: string) => void): void => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-'))
  try {
    expect(createVault(dir).ok).toBe(true)
    body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('verifyVault', () => {
  it('ingest run-log 가 base 대비 diff 에 없으면 defect 와 함께 실패한다', () =>
    withVault((dir) => {
      expect(verifyVault({ vaultDir: dir, base: 'HEAD' })).toEqual({
        status: 'fail',
        defects: [expect.stringContaining('run-log')]
      })
    }))

  it('작업 브랜치에 ingest run-log 가 커밋돼 있으면 통과한다', () =>
    withVault((dir) => {
      const base = git(dir, 'rev-parse', 'HEAD')
      git(dir, 'checkout', '-q', '-b', 'app/ingest-2026-09-14')
      write(dir, 'outputs/runs/2026-09-14-ingest-tester.md', RUN_LOG)
      commit(dir, 'ingest')
      expect(verifyVault({ vaultDir: dir, base })).toEqual({ status: 'pass' })
    }))

  it('볼트 필수 폴더가 없으면 검증 불가로 알린다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verify-'))
    try {
      expect(verifyVault({ vaultDir: dir, base: 'HEAD' })).toEqual({
        status: 'unavailable',
        reason: expect.stringContaining('자료 보관함 폴더가 아니에요')
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('scanFrontmatter', () => {
  it('구조는 맞지만 YAML 로 읽히지 않는 블록을 파서가 잡는다', () => {
    expect(scanFrontmatter('---\ntitle: [unclosed\n---\n', 'wiki/a.md')).toEqual([
      expect.stringMatching(/^wiki\/a\.md: frontmatter is not valid YAML — /)
    ])
  })

  it('매핑이 아닌 frontmatter 는 타입 이름을 알린다', () => {
    expect(scanFrontmatter('---\n- a\n- b\n---\n', 'wiki/a.md')).toEqual([
      'wiki/a.md: frontmatter must be a mapping, got list'
    ])
  })

  it('frontmatter 가 없거나 비어 있으면 결함이 없다', () => {
    expect(scanFrontmatter('# 제목\n', 'wiki/a.md')).toEqual([])
    expect(scanFrontmatter('---\n---\n', 'wiki/a.md')).toEqual([])
  })
})

describe('scanNextAction', () => {
  const page = (...frontmatter: string[]): string =>
    ['---', ...frontmatter, '---', '# 본문', ''].join('\n')
  const DOC = 'docs/project-next-action.md'

  it('한 건은 인용 스칼라, 여러 건은 블록 시퀀스, 없으면 빈 값 — 모두 결함이 없다', () => {
    expect(scanNextAction(page('title: a', 'next_action: "A사 세션 준비"'), 'wiki/a.md')).toEqual(
      []
    )
    expect(
      scanNextAction(page('next_action:', '  - "하나"', '  - 둘', 'title: a'), 'wiki/a.md')
    ).toEqual([])
    expect(scanNextAction(page('next_action: ""'), 'wiki/a.md')).toEqual([])
    expect(scanNextAction(page('next_action: [ ]'), 'wiki/a.md')).toEqual([])
    expect(scanNextAction(page('title: a'), 'wiki/a.md')).toEqual([])
    expect(scanNextAction('# 제목\n', 'wiki/a.md')).toEqual([])
    expect(scanNextAction('---\nnext_action: "a; b"\n', 'wiki/a.md')).toEqual([])
  })

  it('세미콜론으로 이은 절은 그 줄 번호와 함께 알린다', () => {
    expect(scanNextAction(page('title: a', 'next_action: "a; b"'), 'wiki/a.md')).toEqual([
      `wiki/a.md:3 next_action scalar uses ';' to join clauses — each clause is its own sequence item (${DOC})`
    ])
    expect(
      scanNextAction(page('next_action:', '  - "하나"', '', '  - "둘; 셋"'), 'wiki/a.md')
    ).toEqual([
      `wiki/a.md:5 next_action item 2 uses ';' to join clauses — each clause is its own sequence item (${DOC})`
    ])
  })

  it('300바이트 상한은 글자가 아니라 UTF-8 바이트로 잰다', () => {
    const korean = '가'.repeat(101) // 303 바이트
    expect(scanNextAction(page(`next_action: "${korean}"`), 'wiki/a.md')).toEqual([
      `wiki/a.md:2 next_action scalar is 303 bytes (max 300) — one action per item, detail in the body (${DOC})`
    ])
    expect(scanNextAction(page(`next_action: "${'가'.repeat(100)}"`), 'wiki/a.md')).toEqual([])
  })

  it('줄 구분 문자(U+2028)가 섞인 값도 원본처럼 판정한다', () => {
    expect(scanNextAction(page('next_action: "a\u2028b; c"'), 'wiki/a.md')).toEqual([
      `wiki/a.md:2 next_action scalar uses ';' to join clauses — each clause is its own sequence item (${DOC})`
    ])
  })

  it('한 줄 목록과 블록 스칼라는 모양 자체를 알린다', () => {
    expect(scanNextAction(page('next_action: [a, b]'), 'wiki/a.md')).toEqual([
      `wiki/a.md:2 next_action must be a quoted scalar or a block sequence, not an inline flow sequence — one item per line (${DOC})`
    ])
    expect(scanNextAction(page('next_action: |', '  a', '  b'), 'wiki/a.md')).toEqual([
      `wiki/a.md:2 next_action must be a quoted scalar or a block sequence, not a block scalar — a value with line breaks is unreadable in the base table cell (${DOC})`
    ])
  })

  it('frontmatter 구조 결함이 있으면 next_action 은 판정하지 않는다', () =>
    withVault((dir) => {
      write(dir, 'wiki/a.md', page('title: a', 'title: b', 'next_action: "a; b"'))
      commit(dir, 'page')
      expect(verifyVault({ vaultDir: dir, base: 'HEAD', lane: 'none' })).toEqual({
        status: 'fail',
        defects: [expect.stringContaining('duplicate key `title`')]
      })
    }))
})

describe('writeVolumeLine', () => {
  it('저장된 볼륨 줄만 fold 값으로 바꾸고, 줄이 없으면 파일을 건드리지 않는다', () =>
    withVault((dir) => {
      const memory = join(dir, 'wiki/VAULT_MEMORY.md')
      const before = readFileSync(memory, 'utf8')
      writeVolumeLine(dir)
      expect(readFileSync(memory, 'utf8')).toBe(before)

      appendFileSync(
        memory,
        '- Volume to date: 9 ingest runs / 9 clippings (a → b) → wiki 9 notes\n'
      )
      writeVolumeLine(dir)
      expect(readFileSync(memory, 'utf8')).toContain(
        formatVolumeLine(computeVolume(dir), '').split('(실측')[0]!
      )
    }))
})

// 원본 vault_verify.py 와 같은 볼트에서 같은 결함을 내는지 대조한다. vault-kit 동기화로 원본이 바뀌면 여기가 먼저 깨진다.
// 개발 PC 에만 필요한 python3 — 없으면 건너뛰지 않고 실패한다(조용히 건너뛰는 검사는 검사가 아니다)
describe('vault_verify.py 와 판정 대조', () => {
  const SCRIPT = vaultKitPath('projects/second-brain/config/scripts/vault_verify.py')

  const python = (vaultDir: string, base: string, lane: VerifyLane): string[] | 'pass' => {
    const run = spawnSync('python3', [SCRIPT, '--lane', lane, '--base', base], {
      cwd: vaultDir,
      env: { ...process.env, VAULT_DIR: vaultDir },
      encoding: 'utf8'
    })
    if (run.error) throw new Error(`이 대조 테스트는 python3 가 필요하다: ${run.error.message}`)
    if (run.status === 0) return 'pass'
    if (run.status !== 1) throw new Error(`vault_verify.py exit ${run.status}: ${run.stderr}`)
    return run.stdout
      .split('\n')
      .map((line) => /^\s+- (.*)$/.exec(line)?.[1])
      .filter((defect): defect is string => defect !== undefined)
  }

  const same = (dir: string, base: string, lane: VerifyLane): void => {
    const ours = verifyVault({ vaultDir: dir, base, lane })
    const theirs = python(dir, base, lane)
    expect(ours).toEqual(
      theirs === 'pass' ? { status: 'pass' } : { status: 'fail', defects: theirs }
    )
  }

  const scenarios: Array<
    [name: string, setup: (dir: string) => { base: string; lane: VerifyLane }]
  > = [
    ['갓 만든 볼트 (ingest 흔적 없음)', () => ({ base: 'HEAD', lane: 'ingest' })],
    ['갓 만든 볼트 (lane none)', () => ({ base: 'HEAD', lane: 'none' })],
    [
      'run-log 커밋 + untracked run-log',
      (dir) => {
        const base = git(dir, 'rev-parse', 'HEAD')
        write(dir, 'outputs/runs/a.md', RUN_LOG)
        commit(dir, 'run-log')
        write(dir, 'outputs/runs/b.md', RUN_LOG.replace('kind: ingest', 'kind: lint'))
        return { base, lane: 'ingest' }
      }
    ],
    [
      'frontmatter 구조 결함 넷',
      (dir) => {
        write(dir, 'wiki/tab.md', '---\ntags:\n\t- a\n---\n')
        write(dir, 'wiki/dup.md', '---\ntitle: a\ntitle: b\n---\n')
        write(dir, 'wiki/seq.md', '---\nup: "[[x]]"\n  - orphan\n---\n')
        write(dir, 'wiki/open.md', '---\ntitle: a\n')
        write(
          dir,
          'wiki/ok.md',
          '---\ntitle: "quoted \\" still"\nbody: |\n  - not a seq\nitems:\n  - name: a\n  - name: b\n---\n'
        )
        write(dir, 'raw/skip.md', '---\ntitle: a\ntitle: b\n---\n')
        commit(dir, 'pages')
        return { base: 'HEAD', lane: 'none' }
      }
    ],
    [
      'raw 수정·삭제·이름 바꾸기와 추가',
      (dir) => {
        write(dir, 'raw/keep.md', 'a\n')
        write(dir, 'raw/gone.md', 'b\n')
        write(dir, 'raw/move.md', 'c\n')
        commit(dir, 'raw')
        const base = git(dir, 'rev-parse', 'HEAD')
        write(dir, 'raw/keep.md', 'changed\n')
        rmSync(join(dir, 'raw/gone.md'))
        git(dir, 'mv', 'raw/move.md', 'raw/moved.md')
        write(dir, 'raw/new.md', 'd\n')
        commit(dir, 'touch raw')
        return { base, lane: 'none' }
      }
    ],
    [
      '메모리 크기·마커 중복·긴 마커',
      (dir) => {
        const marker = `- Last Ingest: ${'x'.repeat(220)}\n`
        appendFileSync(
          join(dir, 'wiki/VAULT_MEMORY.md'),
          `${marker}- Last Lint: a\n- Last Lint: b\n${'y'.repeat(8200)}\n`
        )
        return { base: 'HEAD', lane: 'none' }
      }
    ],
    [
      '어긋난 볼륨 줄과 토픽 root·sub',
      (dir) => {
        write(dir, 'outputs/runs/r.md', RUN_LOG)
        write(dir, 'wiki/topics/root.md', '---\nup:\ntitle: root\n---\n')
        write(dir, 'wiki/topics/sub.md', '---\nup: "[[root]]"\n---\n')
        write(dir, 'wiki/note.md', '# note\n')
        write(dir, 'docs/vault-ingest-log.md', '- Last Ingest: 2026-08-01 processed 3 clippings\n')
        appendFileSync(
          join(dir, 'wiki/VAULT_MEMORY.md'),
          '- Volume to date: 5 ingest runs / 1 clippings (2026-01-01 → 2026-01-02) → wiki 0 notes(실측 x), 토픽 0 root + 0 sub\n'
        )
        commit(dir, 'volume')
        return { base: 'HEAD', lane: 'none' }
      }
    ],
    [
      'next_action 모양 결함',
      (dir) => {
        write(dir, 'wiki/semi.md', '---\ntitle: a\nnext_action: "a; b"\n---\n')
        write(dir, 'wiki/long.md', `---\nnext_action: '${'가'.repeat(101)}'\n---\n`)
        write(dir, 'wiki/seq.md', '---\nnext_action:\n  - "ok"\n\n  - x; y\nup:\n---\n')
        write(dir, 'wiki/flow.md', '---\nnext_action: [a, b]\n---\n')
        write(dir, 'wiki/block.md', '---\nnext_action: >-\n  a\n---\n')
        write(dir, 'wiki/empty.md', '---\nnext_action: []\n---\n')
        write(dir, 'wiki/broken.md', '---\nnext_action: "a; b"\nnext_action: c\n---\n')
        write(dir, 'wiki/crlf.md', '---\r\ntitle: a\r\nnext_action: "a; b"\r\n---\r\n')
        write(dir, 'raw/skip.md', '---\nnext_action: "a; b"\n---\n')
        commit(dir, 'next_action')
        return { base: 'HEAD', lane: 'none' }
      }
    ],
    [
      '읽히지 않는 볼륨 줄',
      (dir) => {
        appendFileSync(join(dir, 'wiki/VAULT_MEMORY.md'), '- Volume to date: many\n')
        return { base: 'HEAD', lane: 'none' }
      }
    ]
  ]

  it.each(scenarios)('%s', (_name, setup) =>
    withVault((dir) => {
      const { base, lane } = setup(dir)
      same(dir, base, lane)
    })
  )
})
