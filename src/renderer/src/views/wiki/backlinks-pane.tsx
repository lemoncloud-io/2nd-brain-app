// 본문 아래 링크 칸 — Obsidian 의 백링크 칸과 같은 세 묶음.
// ① 여기를 가리키는 페이지 ② 링크 없이 이 이름을 적은 곳("링크 걸기" 로 그 자리만 `[[ ]]` 로 바꾼다)
// ③ 이 문서에서 가리킨 곳이 없는 링크("만들기" 로 그 이름의 노트를 이 폴더에 만든다).
// 바꾸기·만들기는 사람이 누른 편집이다 — 편집과 같은 `edit: <slug>` 커밋, AI 는 쓰지 않는다.
import { useEffect, useMemo, useState } from 'react'
import type { BacklinkSource } from '../../../../shared/wiki/backlinks'
import { linkMention, type Mention } from '../../../../shared/wiki/link-gaps'
import {
  createLinkResolver,
  resolveLink,
  type PageRef,
  type WikiPage
} from '../../../../shared/wiki/parse'
import { Button } from '../../components/ui/button'
import { ErrorNote } from '../../components/error-note'
import { toUserError, type UserError } from '../../lib/user-error'
import { useWorkbench } from '../../store/workbench'
import { getT, useT } from '../../lib/i18n'

type Props = {
  page: WikiPage
  /** 이 문서를 읽은 때 — 바뀌면 언급을 다시 센다 */
  hash: string
  /** 위키 목록에 없는 문서는 null — 그런 문서는 목록이 세지 않으니 "아직 없음" 이 거짓이 된다 */
  backlinks: BacklinkSource[] | null
  index: PageRef[]
  onNavigate: (rel: string) => void
}

const HEADING = 'text-caption text-muted-foreground'
const ACTION = 'h-6 shrink-0 px-1.5 text-caption'

/** 이 문서를 가리킬 링크 글 — 파일 이름만으로 풀리면 그것, 아니면 경로 */
const linkTargetFor = (page: WikiPage, index: PageRef[]): string => {
  const base = page.slug.split('/').pop() ?? page.slug
  return resolveLink(base, index).rel === page.rel ? base : page.slug
}

export const BacklinksPane = ({
  page,
  hash,
  backlinks,
  index,
  onNavigate
}: Props): React.JSX.Element => {
  const t = useT()
  const newNote = useWorkbench((s) => s.newNote)
  const [mentions, setMentions] = useState<Mention[] | null>(null)
  // 조회 실패와 액션 실패는 다른 자리 — 만들기 시작에 조회 실패를 지우면
  // 실패가 없음으로 보인다
  const [queryError, setQueryError] = useState<UserError | null>(null)
  const [error, setError] = useState<UserError | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let stale = false
    // 조회 실패는 빈 값으로 뭉개지 않는다 — "없음"과 실패를 구분해 이미 있는 실패 자리에 보인다.
    // 다시 세기가 시작되면 이전 조회 실패는 지운다. 만들기·링크 걸기는
    // 자기 자리(action error)만 쓰고 조회 실패는 건드리지 않는다
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 다시 세기 시작에 이전 조회 실패를 지우는 것이 목적이다
    setQueryError(null)
    void window.api
      .unlinkedMentions(page.rel)
      .then((result) => {
        if (stale) return
        if ('error' in result) {
          setQueryError(toUserError(result.error, getT().wikiPanes.backlinks.countFailed))
          setMentions([])
          return
        }
        setMentions(result)
      })
      .catch((e: unknown) => {
        if (stale) return
        setQueryError(toUserError(e, getT().wikiPanes.backlinks.countFailed))
        setMentions([])
      })
    return () => {
      stale = true
    }
  }, [page.rel, hash, version])

  // 가리킨 곳이 없는 링크 — 대상별로 한 번 (index 전체 재주사를 링크마다 반복하지 않는다)
  const resolveRef = useMemo(() => createLinkResolver(index), [index])
  const unresolved = useMemo(() => {
    const seen = new Set<string>()
    return page.links
      .filter((link) => !link.vaultFile && resolveRef(link.target).rel === null)
      .map((link) => link.target.trim())
      .filter((target) => {
        const key = target.toLowerCase()
        if (target === '' || seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [page.links, resolveRef])

  const link = async (m: Mention): Promise<void> => {
    setBusy(`${m.rel}:${m.line}`)
    setError(null)
    try {
      const source = await window.api.readWikiPage(m.rel)
      if ('error' in source) throw new Error(source.error)
      const offset = source.text.length - source.page.body.length
      const next = linkMention(source.text, offset, m.line, m.term, linkTargetFor(page, index))
      if (next === null) throw new Error(getT().wikiPanes.backlinks.lineMoved)
      const wrote = await window.api.writeWikiPage(m.rel, next, source.hash)
      if ('error' in wrote) throw new Error(wrote.error)
      setVersion((v) => v + 1)
    } catch (e) {
      setError(toUserError(e, getT().wikiPanes.backlinks.linkFailed))
    } finally {
      setBusy(null)
    }
  }

  const create = async (target: string): Promise<void> => {
    setBusy(`create:${target}`)
    setError(null)
    // 경로를 적은 링크는 wiki/ 아래 그 자리, 이름만 적은 링크는 이 문서 옆에 만든다
    const slash = target.lastIndexOf('/')
    const folder =
      slash >= 0
        ? `wiki/${target.slice(0, slash)}`
        : page.rel.includes('/')
          ? page.rel.slice(0, page.rel.lastIndexOf('/'))
          : ''
    const made = await newNote(folder, target.slice(slash + 1))
    if ('error' in made) setError(toUserError(made.error, getT().wikiPanes.backlinks.createFailed))
    setBusy(null)
  }

  return (
    <section
      data-testid="wiki-backlinks"
      aria-busy={busy !== null}
      className="mt-12 border-t border-hairline pt-5"
    >
      {/* 도는 동안 단추가 잠긴다 — 무엇이 도는지 말하지 않으면 멈춘 것으로 보인다 */}
      {busy !== null && (
        <p role="status" className="text-caption text-muted-foreground">
          {busy.startsWith('create:')
            ? t.wikiPanes.backlinks.creating
            : t.wikiPanes.backlinks.linking}
        </p>
      )}
      {backlinks !== null && (
        <>
          <h2 className={HEADING}>
            {t.wikiPanes.backlinks.title}
            {backlinks.length > 0 && ` ${backlinks.length}`}
          </h2>
          {backlinks.length === 0 ? (
            <p className="mt-2 text-caption text-muted-foreground">{t.wikiPanes.backlinks.none}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {backlinks.map((b) => (
                <li key={b.rel}>
                  <button
                    type="button"
                    data-testid="wiki-backlink"
                    title={b.rel}
                    onClick={() => onNavigate(b.rel)}
                    className="focus-ring wrap-anywhere rounded-sm text-left text-label hover:underline"
                  >
                    {b.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {queryError && <ErrorNote error={queryError} className="mt-4" />}
      {error && <ErrorNote error={error} className="mt-4" />}

      {mentions !== null && mentions.length > 0 && (
        <div data-testid="wiki-mentions" className="mt-6">
          <h2 className={HEADING}>
            {t.wikiPanes.backlinks.mentions} {mentions.length}
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {mentions.map((m) => (
              <li
                key={`${m.rel}:${m.line}`}
                data-testid={`wiki-mention:${m.rel}:${m.line}`}
                className="flex items-start gap-2"
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    title={m.rel}
                    onClick={() => onNavigate(m.rel)}
                    className="focus-ring wrap-anywhere rounded-sm text-left text-label hover:underline"
                  >
                    {m.title}
                  </button>
                  <p className="truncate text-caption text-muted-foreground">{m.snippet}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={ACTION}
                  disabled={busy !== null}
                  data-testid={`wiki-mention-link:${m.rel}:${m.line}`}
                  title={t.wikiPanes.backlinks.linkHint(m.term)}
                  onClick={() => void link(m)}
                >
                  {t.wikiPanes.backlinks.link}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {unresolved.length > 0 && (
        <div data-testid="wiki-unresolved" className="mt-6">
          <h2 className={HEADING}>
            {t.wikiPanes.backlinks.unresolved} {unresolved.length}
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {unresolved.map((target) => (
              <li key={target} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-label text-muted-foreground">
                  {target}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className={ACTION}
                  disabled={busy !== null}
                  data-testid={`wiki-unresolved-create:${target}`}
                  title={t.wikiPanes.backlinks.createHint(target)}
                  onClick={() => void create(target)}
                >
                  {t.wikiPanes.backlinks.create}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
