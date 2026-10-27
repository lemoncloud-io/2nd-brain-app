// 편집기의 "템플릿" — 보관함 `templates/` 에서 하나를 골라 커서 자리에 넣는다.
// 목록은 열 때마다 읽는다(템플릿 폴더는 사람이 Obsidian 에서도 고친다).
import { useState } from 'react'
import { DropdownMenu } from 'radix-ui'
import { LayoutTemplate } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { useT } from '../../lib/i18n'

const ITEM =
  'flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-callout text-foreground outline-none select-none data-[highlighted]:bg-accent'

export const TemplateMenu = ({ onPick }: { onPick: (rel: string) => void }): React.JSX.Element => {
  const t = useT()
  const [templates, setTemplates] = useState<{ rel: string; name: string }[] | null>(null)
  // 읽기 실패와 비어 있음은 다른 문구 — 실패를 없음으로 뭉개지 않는다
  const [failed, setFailed] = useState(false)
  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        // 못 읽으면 실패 문구 — "읽는 중…"에 갇히지 않는다. 다시 열면 다시 읽는다
        if (open) {
          // 실패 뒤 다시 열면 낡은 빈 목록 대신 읽는 중으로 — 한 프레임이라도 없음으로 보이면 안 된다
          if (failed) setTemplates(null)
          setFailed(false)
          void window.api
            .listTemplates()
            .then(setTemplates)
            .catch(() => {
              setTemplates([])
              setFailed(true)
            })
        }
      }}
    >
      <DropdownMenu.Trigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="wiki-template"
          title={t.wikiDoc.template.hint}
        >
          <LayoutTemplate aria-hidden /> {t.wikiDoc.template.label}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          data-testid="template-menu"
          className="z-50 max-h-80 min-w-48 overflow-y-auto rounded-md border border-hairline bg-elevated p-1 shadow-overlay"
        >
          {templates === null ? (
            <p className="px-2 py-1.5 text-caption text-muted-foreground">{t.shell.reading}</p>
          ) : failed ? (
            <p className="px-2 py-1.5 text-caption text-muted-foreground">
              {t.wikiDoc.template.failed}
            </p>
          ) : templates.length === 0 ? (
            <p className="px-2 py-1.5 text-caption text-muted-foreground" title="templates/">
              {t.wikiDoc.template.empty}
            </p>
          ) : (
            templates.map((template) => (
              <DropdownMenu.Item
                key={template.rel}
                className={ITEM}
                data-testid={`template-option:${template.rel}`}
                onSelect={() => onPick(template.rel)}
              >
                {template.name}
              </DropdownMenu.Item>
            ))
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
