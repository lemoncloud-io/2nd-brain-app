import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  checkMcpServer,
  parseEnvLines,
  parseMcpJson,
  splitCommandLine,
  type McpServer
} from '../../../shared/mcp-servers'
import { SettingsSection } from '../components/layout/settings-section'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle
} from '../components/ui/alert-dialog'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { toUserError } from '../lib/user-error'
import { getT, useT } from '../lib/i18n'

// 설정 → MCP 서버 — 채팅이 쓸 바깥 도구(Claude 데스크톱·Claudian 의 MCP 와 같은 것). 더하고, 끄고, 지운다.
// 켠 서버만 다음 질문부터 엔진 CLI 에 넘어간다. 명령은 이 컴퓨터에서 돌므로 믿는 서버만 더하라고 적어 둔다.

const summary = (s: McpServer): string =>
  s.kind === 'http' ? s.url : [s.command, ...s.args].join(' ')

const McpSection = (): React.JSX.Element => {
  const t = useT()
  const [servers, setServers] = useState<McpServer[] | null>(null)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [envText, setEnvText] = useState('')
  const [json, setJson] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // 연결 확인 — 행마다 결과(성공 문구·사유)를 들고, 도는 동안은 서버 이름만 든다
  const [probing, setProbing] = useState<string | null>(null)
  const [probeResults, setProbeResults] = useState<Record<string, string>>({})

  const probe = (serverName: string): void => {
    setProbing(serverName)
    setProbeResults((prev) => {
      const next = { ...prev }
      delete next[serverName]
      return next
    })
    window.api
      .probeMcpServer(serverName)
      .then((result) =>
        setProbeResults((prev) => ({
          ...prev,
          [serverName]: result.ok ? getT().settings.mcp.probeOk : result.reason
        }))
      )
      .catch((err: unknown) =>
        setProbeResults((prev) => ({
          ...prev,
          [serverName]: toUserError(err, getT().settings.mcp.probeFailed).text
        }))
      )
      .finally(() => setProbing((current) => (current === serverName ? null : current)))
  }
  // 지우기는 되돌릴 수 없다 — 휴지통이 아니라 목록에서 바로 빠지므로 먼저 묻는다
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .getMcpServers()
      .then(setServers)
      .catch((err: unknown) => {
        setServers([])
        setError(toUserError(err, getT().settings.mcp.listFailed).text)
      })
  }, [])

  const save = (next: McpServer[], after?: () => void): void => {
    setSaving(true)
    setError(null)
    window.api
      .setMcpServers(next)
      .then((saved) => {
        setServers(saved)
        after?.()
      })
      .catch((err: unknown) => setError(toUserError(err, getT().settings.mcp.saveFailed).text))
      .finally(() => setSaving(false))
  }

  const taken = (list: McpServer[]): string | null => {
    const dup = list.find((s) => servers?.some((have) => have.name === s.name))
    return dup ? getT().settings.mcp.taken(dup.name) : null
  }

  const add = (): void => {
    const trimmed = target.trim()
    const http = /^https?:\/\//.test(trimmed)
    const [command = '', ...args] = http ? [] : splitCommandLine(trimmed)
    const server = checkMcpServer({
      name,
      enabled: true,
      kind: http ? 'http' : 'stdio',
      command,
      args,
      env: parseEnvLines(envText),
      url: http ? trimmed : ''
    })
    if ('error' in server) {
      setError(server.error)
      return
    }
    const dup = taken([server])
    if (dup) {
      setError(dup)
      return
    }
    save([...(servers ?? []), server], () => {
      setName('')
      setTarget('')
      setEnvText('')
    })
  }

  const importJson = (): void => {
    const parsed = parseMcpJson(json)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    const dup = taken(parsed)
    if (dup) {
      setError(dup)
      return
    }
    save([...(servers ?? []), ...parsed], () => setJson(''))
  }

  const busy = servers === null || saving

  return (
    <SettingsSection title={t.settings.mcp.title}>
      <p className="text-caption text-muted-foreground">{t.settings.mcp.intro}</p>

      {servers !== null && servers.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-hairline" data-testid="mcp-list">
          {servers.map((s) => (
            <li
              key={s.name}
              className="flex min-w-0 items-center gap-3 py-2"
              data-testid={`mcp-server:${s.name}`}
            >
              <Checkbox
                checked={s.enabled}
                disabled={busy}
                aria-label={t.settings.mcp.enable(s.name)}
                data-testid={`mcp-enabled:${s.name}`}
                onCheckedChange={(checked) =>
                  save(
                    servers.map((x) =>
                      x.name === s.name ? { ...x, enabled: checked === true } : x
                    )
                  )
                }
              />
              <div className="min-w-0 flex-1">
                <p className="text-callout">
                  {s.name}
                  {!s.enabled && (
                    <span className="ml-2 text-caption text-muted-foreground">
                      {t.settings.mcp.off}
                    </span>
                  )}
                </p>
                <p className="truncate text-caption text-muted-foreground" title={summary(s)}>
                  {summary(s)}
                  {Object.keys(s.env).length > 0 &&
                    t.settings.mcp.envCount(Object.keys(s.env).length)}
                </p>
                {probeResults[s.name] && (
                  <p
                    data-testid={`mcp-probe-result:${s.name}`}
                    className="text-caption text-muted-foreground"
                  >
                    {probeResults[s.name]}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || probing !== null}
                data-testid={`mcp-probe:${s.name}`}
                aria-label={t.settings.mcp.probeLabel(s.name)}
                onClick={() => probe(s.name)}
              >
                {probing === s.name ? t.shell.checking : t.settings.mcp.probe}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                data-testid={`mcp-remove:${s.name}`}
                aria-label={t.settings.mcp.removeLabel(s.name)}
                onClick={() => setRemoving(s.name)}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <p className="text-caption text-muted-foreground">{t.settings.mcp.presetHint}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="mcp-preset-stdio"
            disabled={busy}
            onClick={() => {
              setName('local-tools')
              setTarget(t.settings.mcp.presetStdioTarget)
              setError(null)
            }}
          >
            {t.settings.mcp.presetStdio}
          </Button>
          <Button
            size="sm"
            variant="outline"
            data-testid="mcp-preset-http"
            disabled={busy}
            onClick={() => {
              setName('web-tools')
              setTarget(t.settings.mcp.presetHttpTarget)
              setError(null)
            }}
          >
            {t.settings.mcp.presetHttp}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label={t.settings.mcp.nameLabel}
            placeholder={t.settings.mcp.namePlaceholder}
            className="w-40"
            data-testid="mcp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            aria-label={t.settings.mcp.targetLabel}
            placeholder={t.settings.mcp.targetPlaceholder}
            className="min-w-60 flex-1"
            data-testid="mcp-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <Button
            size="sm"
            className="h-9"
            disabled={busy || name.trim() === '' || target.trim() === ''}
            data-testid="mcp-add"
            onClick={add}
          >
            <Plus aria-hidden /> {t.settings.mcp.add}
          </Button>
        </div>
        <details className="text-caption">
          <summary className="cursor-pointer text-muted-foreground">
            {t.settings.mcp.envSummary}
          </summary>
          <textarea
            aria-label={t.settings.mcp.envLabel}
            placeholder={t.settings.mcp.envPlaceholder}
            className="focus-ring mt-2 h-20 w-full rounded-md border border-input-border bg-background px-3 py-2 font-mono text-caption"
            data-testid="mcp-env"
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
          />
        </details>
        <details className="text-caption">
          <summary className="cursor-pointer text-muted-foreground">
            {t.settings.mcp.jsonSummary}
          </summary>
          <textarea
            aria-label={t.settings.mcp.jsonLabel}
            placeholder={t.settings.mcp.jsonPlaceholder}
            className="focus-ring mt-2 h-28 w-full rounded-md border border-input-border bg-background px-3 py-2 font-mono text-caption"
            data-testid="mcp-json"
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={busy || json.trim() === ''}
            data-testid="mcp-import"
            onClick={importJson}
          >
            {t.settings.mcp.import}
          </Button>
        </details>
      </div>

      {error !== null && (
        <p role="alert" className="mt-2 text-caption text-destructive" data-testid="mcp-error">
          {error}
        </p>
      )}
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent data-testid="mcp-remove-confirm">
          <AlertDialogTitle>{t.settings.mcp.removeTitle(removing ?? '')}</AlertDialogTitle>
          <AlertDialogDescription>{t.settings.mcp.removeDetail}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.settings.mcp.keep}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="mcp-remove-confirm-ok"
              onClick={() => {
                if (servers !== null && removing !== null) {
                  save(servers.filter((x) => x.name !== removing))
                }
                setRemoving(null)
              }}
            >
              {t.settings.mcp.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}

export default McpSection
