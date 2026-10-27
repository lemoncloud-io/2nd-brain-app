// 중복 페이지 합치기 — AI 점검이 같은 개념이라고 짚은 두 페이지를 사람이 받은 제안대로 하나로 만든다.
// 위키화처럼 작업 브랜치·승인 화면을 거치지 않는다: 제안을 받는 것이 승인이다(AI로 고치기와 같다).
// 받으면 `edit: merge <지울> into <남길>` 커밋 하나 — 합친 글, aliases, 다른 문서의 링크, 지울 파일 삭제.
// 바로 되돌리면 그 커밋을 거꾸로 적용한 `undo: merge <지울>` 커밋 하나. 그사이 다른 커밋이 생겼으면 거절한다.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Engine } from '../engine/engine'
import type { MergeDraft, MergeSide } from '../../shared/ipc-contract'
import { parseWikiPage } from '../../shared/wiki/parse'
import {
  bodyOf,
  isWikiPagePath,
  pageName,
  pickKeep,
  planMerge,
  type MergePage,
  type MergePlan
} from '../../shared/wiki/merge-pages'
import { git } from '../git'
import { appIdentity } from '../vault/app-identity'
import { resolveInVault } from '../vault/vault-path'
import { ignoredByGit, vaultDocPaths } from '../vault/vault-scope'
import { defaultBranchOf, isWorkBranch, notOnDefaultReason } from '../engine/work-branch'
import { INGEST_LOCK } from '../engine/claude-engine'
import { commitBlockedReason } from '../vault/sync-service'
import { mainT } from '../i18n'

const OPEN = '<merged>'
const CLOSE = '</merged>'
const SUBJECT = 'edit: merge '

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

const readSide = (vaultDir: string, rel: string): MergeSide | string => {
  const full = isWikiPagePath(rel) ? resolveInVault(vaultDir, rel) : null
  if (full === null) return mainT().wikiMain.mergeOnlyWiki
  if (!existsSync(full)) return mainT().wikiMain.pageGone(pageName(rel))
  const text = readFileSync(full, 'utf8')
  return { rel, title: parseWikiPage(rel, text).title, text, hash: sha256(text) }
}

/**
 * 합칠 두 페이지 — 대소문자만 다른 두 경로는 대소문자를 가리지 않는 디스크(macOS·Windows 기본)에서 한 파일이다.
 * 그대로 합치면 남길 글을 쓰고 같은 파일을 지운다
 */
const readPair = (
  vaultDir: string,
  relA: string,
  relB: string
): [MergeSide, MergeSide] | string => {
  const a = readSide(vaultDir, relA)
  if (typeof a === 'string') return a
  const b = readSide(vaultDir, relB)
  if (typeof b === 'string') return b
  const real = (rel: string): string => realpathSync.native(join(vaultDir, rel))
  if (real(a.rel) === real(b.rel)) return mainT().wikiMain.mergeSame
  return [a, b]
}

/** 링크를 고칠 수 있는 문서 전부 — 위키·프로젝트 등 문서 루트의 마크다운 */
const readDocs = (vaultDir: string): MergePage[] =>
  vaultDocPaths(vaultDir).map((full) => {
    const rel = relative(vaultDir, full).split(sep).join('/')
    const text = readFileSync(full, 'utf8')
    const page = parseWikiPage(rel, text)
    return { rel, slug: page.slug, title: page.title, text }
  })

/** 두 페이지를 문서 목록에서 찾는다 — 링크를 고칠 글과 같은 때 읽은 글을 쓴다 */
const pageIn = (docs: MergePage[], side: MergeSide): MergePage =>
  docs.find((doc) => doc.rel === side.rel) ?? {
    rel: side.rel,
    slug: parseWikiPage(side.rel, side.text).slug,
    title: side.title,
    text: side.text
  }

/** git 이 무시하는 문서는 커밋에 못 실어 고치지 않는다 — 되돌리기가 그 파일을 못 되돌린다 */
const plan = (
  vaultDir: string,
  docs: MergePage[],
  keep: MergeSide,
  drop: MergeSide,
  body: string
): MergePlan => {
  const result = planMerge({ keep: pageIn(docs, keep), drop: pageIn(docs, drop), docs, body })
  return { ...result, edits: result.edits.filter((edit) => !ignoredByGit(vaultDir, edit.rel)) }
}

/** 두 페이지를 읽고 남길 쪽을 고른다 — 더 많이 가리켜지는 쪽이 남아 고칠 링크가 적다 */
export const readMergePair = (
  vaultDir: string,
  relA: string,
  relB: string
): MergeDraft | { error: string } => {
  const pair = readPair(vaultDir, relA, relB)
  if (typeof pair === 'string') return { error: pair }
  const [a, b] = pair
  const docs = readDocs(vaultDir)
  const picked = pickKeep(pageIn(docs, a), pageIn(docs, b), docs)
  const [keep, drop] = picked.keep.rel === a.rel ? [a, b] : [b, a]
  const edits = plan(vaultDir, docs, keep, drop, bodyOf(keep.text)).edits
  return { keep, drop, edits: edits.map(({ rel, count }) => ({ rel, count })) }
}

const fence = (tag: string, text: string): string =>
  `<${tag}>\n${text.replaceAll(`</${tag}>`, `</${tag} >`)}\n</${tag}>`

// ui-hangul-ignore: AI 에게 보내는 지시 본문(범위 밖: AI 프롬프트)
export const mergePrompt = (keep: MergeSide, drop: MergeSide): string =>
  [
    '같은 개념을 다루는 위키 페이지 두 개를 한 페이지로 합쳐라.',
    '두 페이지의 사실을 하나도 빠뜨리지 말고, 두 페이지에 없는 주장은 더하지 마라. 겹치는 문장은 한 번만 쓴다.',
    `남는 페이지는 <keep>(${keep.title})이다. 그 페이지의 제목·구성을 따르고 <drop>(${drop.title})의 내용을 알맞은 자리에 넣어라.`,
    '맨 위 속성 블록(--- 사이)은 쓰지 마라 — 본문만. 마크다운·위키링크([[ ]]) 모양은 지킨다.',
    '파일을 쓰거나 수정하지 마라 — 합친 본문을 <merged> 와 </merged> 사이에 한 번만 내라. 설명은 붙이지 않는다.',
    '',
    fence('keep', bodyOf(keep.text)),
    fence('drop', bodyOf(drop.text))
  ].join('\n')

/** 답에서 합친 본문 — 표식이 없으면 null. 엔진이 속성 블록을 붙였으면 떼어 낸다(속성은 남길 페이지 것을 쓴다) */
export const parseMerged = (text: string): string | null => {
  const start = text.indexOf(OPEN)
  const end = text.lastIndexOf(CLOSE)
  if (start < 0 || end < start) return null
  const body = bodyOf(text.slice(start + OPEN.length, end).replace(/^\r?\n/, ''))
  return body.trim() === '' ? null : body.replace(/\s*$/, '\n')
}

export const runMergeProposal = async (
  engine: Engine,
  vaultDir: string,
  draft: MergeDraft
): Promise<{ body: string } | { error: string }> => {
  let text = ''
  let done = false
  for await (const event of engine.run({ vaultDir, prompt: mergePrompt(draft.keep, draft.drop) })) {
    if (event.type === 'text') text += event.text
    if (event.type === 'error') return { error: event.message }
    if (event.type === 'done') {
      if (event.canceled) return { error: mainT().wikiMain.proposeStopped }
      done = true
    }
  }
  const body = parseMerged(text)
  if (body === null) {
    console.error('merge proposal answer has no marker', {
      done,
      length: text.length,
      head: text.slice(0, 200),
      tail: text.slice(-200)
    })
    // 끝 신호 없이 멈췄으면 답 형식 탓이 아니다 — AI 프로그램이 중간에 끝났다
    return done ? { error: mainT().wikiMain.aiUnreadable } : { error: mainT().wikiMain.aiCutOff }
  }
  return { body }
}

/** 편집 저장과 같은 거절 — 위키화 중·작업 브랜치·받기 충돌. 기록이 없는 보관함은 되돌릴 수 없어 합치지 않는다 */
const blockedReason = (vaultDir: string, what: string): string | null => {
  if (existsSync(join(vaultDir, INGEST_LOCK))) {
    return mainT().mainErrors.ingestBusyThen(what)
  }
  if (!existsSync(join(vaultDir, '.git'))) return mainT().wikiMain.mergeNoHistory
  if (!defaultBranchOf(vaultDir)) return mainT().mainErrors.noDefaultBranch
  const current = git(vaultDir, ['branch', '--show-current']).trim()
  if (current === '' || isWorkBranch(current)) return notOnDefaultReason(current, what)
  return commitBlockedReason(vaultDir, what)
}

export type ApplyMergeResult =
  { ok: true; commit: string; edited: number } | { ok: false; reason: string }

export const applyMerge = (
  vaultDir: string,
  input: { keep: string; drop: string; body: string; keepHash: string; dropHash: string }
): ApplyMergeResult => {
  const blocked = blockedReason(vaultDir, mainT().mainErrors.thenMerge)
  if (blocked) return { ok: false, reason: blocked }
  const pair = readPair(vaultDir, input.keep, input.drop)
  if (typeof pair === 'string') return { ok: false, reason: pair }
  const [keep, drop] = pair
  if (keep.hash !== input.keepHash || drop.hash !== input.dropHash) {
    return { ok: false, reason: mainT().wikiMain.mergeStale }
  }
  if (ignoredByGit(vaultDir, keep.rel) || ignoredByGit(vaultDir, drop.rel)) {
    return { ok: false, reason: mainT().wikiMain.mergeUntracked }
  }
  if (input.body.trim() === '') return { ok: false, reason: mainT().wikiMain.mergeEmpty }
  // 링크는 지금 디스크 기준으로 다시 고친다 — 제안을 보는 사이 다른 문서가 바뀌었어도 그 글 위에 고친다
  const result = plan(vaultDir, readDocs(vaultDir), keep, drop, input.body)
  const paths = [keep.rel, ...result.edits.map((edit) => edit.rel)]
  // 쓰기 전에 본다 — 기록에 없거나 저장 안 한 변경이 있는 파일이 섞이면 커밋이 실패하거나 남의 변경까지 싣는다
  const dirty = git(vaultDir, [
    '--literal-pathspecs',
    'status',
    '--porcelain',
    '--',
    ...paths,
    drop.rel
  ])
  if (dirty.trim() !== '') {
    return {
      ok: false,
      reason: mainT().wikiMain.mergeDirty
    }
  }
  const write = (rel: string, text: string): void => {
    const full = resolveInVault(vaultDir, rel)
    if (full === null) throw new Error(`path outside the vault: ${rel}`)
    writeFileSync(full, text, 'utf8')
  }
  try {
    write(keep.rel, result.keepText)
    for (const edit of result.edits) write(edit.rel, edit.text)
    git(vaultDir, ['--literal-pathspecs', 'add', '--', ...paths])
    git(vaultDir, ['--literal-pathspecs', 'rm', '-q', '--', drop.rel])
    git(vaultDir, [
      ...appIdentity(),
      '--literal-pathspecs',
      'commit',
      '-q',
      '-m',
      `${SUBJECT}${pageName(drop.rel)} into ${pageName(keep.rel)}`,
      '--',
      ...paths,
      drop.rel
    ])
  } catch (error) {
    throw restoreAfter(vaultDir, [...paths, drop.rel], error)
  }
  return {
    ok: true,
    commit: git(vaultDir, ['rev-parse', 'HEAD']).trim(),
    edited: result.edits.length
  }
}

/**
 * 쓰다 실패했다 — 이 파일들을 맨 위 커밋 상태로 돌린다(쓰기 전에 깨끗한 것을 확인한 파일들이다).
 * 돌리기마저 실패하면 그 사실을 원래 오류에 붙인다 — 반쯤 바뀐 채라는 것을 사람이 알아야 한다
 */
const restoreAfter = (vaultDir: string, paths: string[], cause: unknown): Error => {
  const failed: string[] = []
  for (const rel of paths) {
    try {
      git(vaultDir, ['--literal-pathspecs', 'reset', '-q', '--', rel])
      const inHead =
        git(vaultDir, [
          '--literal-pathspecs',
          'ls-tree',
          '--name-only',
          'HEAD',
          '--',
          rel
        ]).trim() !== ''
      if (inHead) git(vaultDir, ['--literal-pathspecs', 'checkout', 'HEAD', '--', rel])
      else rmSync(join(vaultDir, rel), { force: true })
    } catch (error) {
      console.error('could not restore files after merge failure', rel, error)
      failed.push(rel)
    }
  }
  const message = cause instanceof Error ? cause.message : String(cause)
  return new Error(
    failed.length === 0
      ? message
      : `${message}\n${mainT().wikiMain.unrestored}: ${failed.join(', ')}`,
    { cause }
  )
}

/** 바로 되돌리기 — 합친 커밋이 아직 맨 위일 때만. 그 뒤 커밋이 있으면 거꾸로 적용이 엉킬 수 있어 거절한다 */
export const undoMerge = (
  vaultDir: string,
  commit: string
): { ok: true; commit: string } | { ok: false; reason: string } => {
  const blocked = blockedReason(vaultDir, mainT().mainErrors.thenUndo)
  if (blocked) return { ok: false, reason: blocked }
  if (!/^[0-9a-f]{40}$/.test(commit)) return { ok: false, reason: mainT().wikiMain.undoMissing }
  const head = git(vaultDir, ['rev-parse', 'HEAD']).trim()
  if (head !== commit) {
    return {
      ok: false,
      reason: mainT().wikiMain.undoChanged
    }
  }
  const subject = git(vaultDir, ['log', '-1', '--format=%s', commit]).trim()
  if (!subject.startsWith(SUBJECT)) return { ok: false, reason: mainT().wikiMain.undoMissing }
  const paths = git(vaultDir, ['show', '--name-only', '-z', '--format=', commit])
    .split('\0')
    .filter((path) => path !== '')
  // 실패하면 이 파일들을 맨 위 상태로 돌린다 — 그 전에 저장 안 한 변경이 섞여 있으면 그것까지 지우게 되므로 먼저 거절한다
  const dirty = git(vaultDir, ['--literal-pathspecs', 'status', '--porcelain', '--', ...paths])
  if (dirty.trim() !== '') {
    return { ok: false, reason: mainT().wikiMain.undoUnsaved }
  }
  const drop = subject.slice(SUBJECT.length).replace(/ into .*$/, '')
  try {
    git(vaultDir, ['revert', '--no-commit', commit])
    git(vaultDir, [
      ...appIdentity(),
      '--literal-pathspecs',
      'commit',
      '-q',
      '-m',
      `undo: merge ${drop}`,
      '--',
      ...paths
    ])
  } catch (error) {
    try {
      git(vaultDir, ['revert', '--quit'])
    } catch {
      // 진행 중인 거꾸로 적용이 없다 — 지울 상태가 없다
    }
    throw restoreAfter(vaultDir, paths, error)
  }
  return { ok: true, commit: git(vaultDir, ['rev-parse', 'HEAD']).trim() }
}
