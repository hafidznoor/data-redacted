import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import type { SheetSummary } from '@/lib/excel/read'
import type { ExportScope } from '@/workers/protocol'

interface Props {
  sheets: SheetSummary[]
  selected: Set<string>
  onToggle: (name: string) => void
  scope: ExportScope
  onScopeChange: (scope: ExportScope) => void
}

/**
 * Sheet selection and export scope.
 *
 * Export scope is the sharpest edge in the product. Choosing `whole-workbook`
 * means sheets the user never reviewed ship unredacted inside a file everyone
 * will treat as safe. The safe option is the default, and choosing the other
 * one names exactly which sheets are about to ride along.
 */
export function SheetPicker({ sheets, selected, onToggle, scope, onScopeChange }: Props) {
  const { t } = useTranslation()
  const unpicked = sheets.filter((s) => !selected.has(s.name))
  const passingThrough = scope === 'whole-workbook' && unpicked.length > 0

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {sheets.map((sheet) => {
          const isSelected = selected.has(sheet.name)
          return (
            <label
              key={sheet.name}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 transition-colors sm:px-4',
                isSelected ? 'border-foreground/30 bg-muted' : 'hover:bg-muted/50',
              )}
            >
              <Checkbox checked={isSelected} onCheckedChange={() => onToggle(sheet.name)} />
              <span className="flex-1 truncate text-sm font-medium">{sheet.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {t('sheets.dimensions', { rows: sheet.rowCount, cols: sheet.colCount })}
              </span>
            </label>
          )
        })}
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">{t('sheets.scopeTitle')}</legend>

        {(['selected-only', 'whole-workbook'] as const).map((value) => (
          <label
            key={value}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors sm:px-4',
              scope === value ? 'border-foreground/30 bg-muted' : 'hover:bg-muted/50',
            )}
          >
            <input
              type="radio"
              name="scope"
              value={value}
              checked={scope === value}
              onChange={() => onScopeChange(value)}
              className="mt-1 accent-foreground"
            />
            <span className="space-y-0.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                {t(`sheets.scope.${value}.label`)}
                {value === 'selected-only' && (
                  <Badge variant="secondary" className="text-[10px]">{t('sheets.recommended')}</Badge>
                )}
              </span>
              <span className="text-muted-foreground block text-xs leading-relaxed">
                {t(`sheets.scope.${value}.help`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {passingThrough && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>{t('sheets.passThroughTitle', { count: unpicked.length })}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{t('sheets.passThroughBody')}</p>
            <ul className="list-inside list-disc font-medium">
              {unpicked.map((s) => (
                <li key={s.name}>
                  {s.name}{' '}
                  <span className="font-normal opacity-70">
                    {t('sheets.rowsOnly', { rows: s.rowCount })}
                  </span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
