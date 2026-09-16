import { AnimatedCounter } from '@/components/ui/animated-counter'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import type { AuditReport } from '@/workers/protocol'

/**
 * What actually happened, in a form a compliance reviewer can keep.
 *
 * Records the before/after file hashes so a reviewer can confirm the file they
 * hold is the one this report describes.
 */
export function AuditSummary({ audit, onDownload }: { audit: AuditReport; onDownload: () => void }) {
  const { t } = useTranslation()
  const passedThrough = audit.sheets.filter((s) => s.action === 'passed-through')

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-medium">{t('audit.title')}</h3>
        <Button variant="outline" size="sm" onClick={onDownload}>
          <Download className="size-3.5" />
          {t('audit.download')}
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">{t('audit.cellsChanged')}</dt>
          <dd className="font-medium"><AnimatedCounter value={audit.totalCellsChanged} /></dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('audit.sheetsRedacted')}</dt>
          <dd className="font-medium tabular-nums">
            {audit.sheets.filter((s) => s.action === 'redacted').length}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('audit.sheetsPassed')}</dt>
          <dd className="font-medium tabular-nums">{passedThrough.length}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('audit.sheetsDropped')}</dt>
          <dd className="font-medium tabular-nums">
            {audit.sheets.filter((s) => s.action === 'dropped').length}
          </dd>
        </div>
      </dl>

      {passedThrough.length > 0 && (
        <div className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs">
          {t('audit.passedWarning', { sheets: passedThrough.map((s) => s.name).join(', ') })}
        </div>
      )}

      <div className="space-y-3">
        {audit.sheets
          .filter((s) => s.action === 'redacted')
          .map((sheet) => (
            <div key={sheet.name} className="space-y-1">
              <p className="text-xs font-medium">{sheet.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {sheet.columns.map((col) => (
                  <Badge key={col.header} variant="secondary" className="text-[10px] font-normal">
                    {col.header} · {t(`mode.${col.mode}`)} · {col.cellsChanged.toLocaleString()}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
      </div>

      <dl className="text-muted-foreground space-y-1 border-t pt-3 font-mono text-[10px]">
        <div className="flex gap-2">
          <dt className="shrink-0">{t('audit.sourceHash')}</dt>
          <dd className="truncate">{audit.sourceHash}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0">{t('audit.outputHash')}</dt>
          <dd className="truncate">{audit.outputHash}</dd>
        </div>
      </dl>
    </div>
  )
}
