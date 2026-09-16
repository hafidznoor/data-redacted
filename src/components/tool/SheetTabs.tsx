import { Button } from '@/components/ui/button'
import type { SheetSummary } from '@/lib/excel/read'

/**
 * Sheet switcher.
 *
 * Shared by the column and export steps so the sheet being edited and the sheet
 * being previewed are chosen the same way in both places. Renders nothing for a
 * single-sheet workbook, where there is nothing to switch between.
 */
export function SheetTabs({ sheets, active, onSelect, disabled }: {
  sheets: SheetSummary[]
  active: string
  onSelect: (name: string) => void
  disabled?: boolean
}) {
  if (sheets.length < 2) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {sheets.map((s) => (
        <Button
          key={s.name}
          size="sm"
          variant={s.name === active ? 'default' : 'outline'}
          disabled={disabled}
          aria-current={s.name === active ? 'true' : undefined}
          onClick={() => onSelect(s.name)}
        >
          {s.name}
        </Button>
      ))}
    </div>
  )
}
