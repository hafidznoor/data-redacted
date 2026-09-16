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

const COLUMN_WIDTH = 130
/** Two lines of text-xs (before struck through, after) plus py-2. */
const ROW_HEIGHT = 52

/**
 * Before/after preview.
 *
 * Virtualized: the worker hands over a sample, and only the visible slice of
 * that sample is ever in the DOM. A 500k-row sheet must never reach React.
 *
 * The column name is a sticky header rather than a caption repeated inside
 * every cell: with seven columns and three visible at a time, the name has to
 * stay on screen while the values scroll past it.
 */
export function PreviewTable({ headers, rows, changedColumns }: Props) {
  const { t } = useTranslation()
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    // Generous enough to absorb the sticky header's offset, which the
    // virtualizer does not subtract from scrollTop.
    overscan: 10,
  })

  if (!rows.length) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{t('preview.empty')}</p>
  }

  return (
    <div className="rounded-lg border">
      <div ref={parentRef} className="max-h-[320px] overflow-auto sm:max-h-[440px]">
        {/*
          max-content on this one wrapper is what keeps the header and every row
          on a single shared horizontal scroll position.
        */}
        <div style={{ width: 'max-content', minWidth: '100%' }}>
          <div className="bg-muted sticky top-0 z-10 flex gap-3 border-b px-3 py-2">
            {headers.map((header, col) => (
              <div
                key={col}
                title={header}
                className={cn(
                  'text-muted-foreground shrink-0 truncate text-[10px] font-medium tracking-wide uppercase',
                  changedColumns.has(col) && 'text-foreground',
                )}
                style={{ width: COLUMN_WIDTH }}
              >
                {header}
              </div>
            ))}
          </div>

          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              return (
                <div
                  key={virtualRow.key}
                  className="border-border absolute top-0 left-0 flex gap-3 border-b px-3 py-2"
                  style={{
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                    width: 'max-content',
                    minWidth: '100%',
                  }}
                >
                  {headers.map((_, col) => {
                    const changed = changedColumns.has(col)
                    const before = row.before[col] ?? ''
                    const after = row.after[col] ?? ''
                    return (
                      <div key={col} className="shrink-0" style={{ width: COLUMN_WIDTH }}>
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
              )
            })}
          </div>
        </div>
      </div>
      <p className="text-muted-foreground border-t px-3 py-2 text-xs">
        {t('preview.footer', { count: rows.length })}
      </p>
    </div>
  )
}
