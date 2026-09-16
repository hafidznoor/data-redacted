import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import type { PreviewRow } from '@/workers/protocol'

interface Props {
  headers: string[]
  rows: PreviewRow[]
  changedColumns: Set<number>
}

/**
 * Before/after preview.
 *
 * Virtualized: the worker hands over a sample, and only the visible slice of
 * that sample is ever in the DOM. A 500k-row sheet must never reach React.
 */
export function PreviewTable({ headers, rows, changedColumns }: Props) {
  const { t } = useTranslation()
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 8,
  })

  if (!rows.length) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{t('preview.empty')}</p>
  }

  return (
    <div className="rounded-lg border">
      <div ref={parentRef} className="max-h-[440px] overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]
            return (
              <div
                key={virtualRow.key}
                className="border-border absolute inset-x-0 border-b px-3 py-2"
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              >
                <div className="flex gap-3 overflow-x-auto">
                  {headers.map((header, col) => {
                    const changed = changedColumns.has(col)
                    const before = row.before[col] ?? ''
                    const after = row.after[col] ?? ''
                    return (
                      <div key={col} className="min-w-[130px] shrink-0">
                        <div className="text-muted-foreground truncate text-[10px] uppercase tracking-wide">
                          {header}
                        </div>
                        {changed && before !== after ? (
                          <div className="space-y-0.5">
                            <div className="text-muted-foreground truncate text-xs line-through opacity-60">
                              {before || '—'}
                            </div>
                            <div className="text-success truncate text-xs font-medium">{after || '—'}</div>
                          </div>
                        ) : (
                          <div className={cn('truncate text-xs', !before && 'text-muted-foreground')}>
                            {before || '—'}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-muted-foreground border-t px-3 py-2 text-xs">
        {t('preview.footer', { count: rows.length })}
      </p>
    </div>
  )
}
