import { useCallback, useRef, useState } from 'react'
import FolderComponent from '@/components/ui/folder-component'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

/** Files above this get a warning: a parsed workbook expands several-fold in memory. */
export const SIZE_WARN_BYTES = 50 * 1024 * 1024
const ACCEPT = '.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function Dropzone({ onFile, onSample, busy }: {
  onFile: (file: File) => void
  onSample: () => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  const [dragging, setDragging] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return
      if (!/\.xlsx?$|\.xlsm$/i.test(file.name)) {
        setWarning(t('drop.wrongType'))
        return
      }
      setWarning(file.size > SIZE_WARN_BYTES ? t('drop.large') : null)
      onFile(file)
    },
    [onFile, t],
  )

  return (
    <div className="flex flex-col items-center gap-6">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files?.[0]) }}
        className={cn(
          'group flex flex-col items-center gap-5 rounded-2xl border-2 border-dashed px-10 py-12 transition-colors',
          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
          dragging ? 'border-foreground bg-muted' : 'border-border hover:border-foreground/40',
          busy && 'pointer-events-none opacity-60',
        )}
        aria-label={t('drop.aria')}
      >
        <div className={cn('transition-transform', dragging && 'scale-110')}>
          <FolderComponent color="black" size="lg" />
        </div>
        <div className="space-y-1 text-center">
          <p className="text-base font-medium">{t('drop.title')}</p>
          <p className="text-muted-foreground text-sm">{t('drop.subtitle')}</p>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => accept(e.target.files?.[0])}
      />

      {/*
        A sample file so nobody has to risk their own data to find out what the
        tool does. Loaded from our own origin, so connect-src 'self' covers it.
      */}
      <button
        type="button"
        disabled={busy}
        onClick={onSample}
        className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4 transition-colors"
      >
        {t('drop.sample')}
      </button>

      {/* The privacy claim has to land here — there is no landing page carrying it. */}
      <p className="text-muted-foreground max-w-sm text-center text-xs leading-relaxed">
        {t('drop.privacy')}
      </p>

      {warning && (
        <p role="status" className="text-warning-foreground bg-warning/20 rounded-md px-3 py-2 text-xs">
          {warning}
        </p>
      )}
    </div>
  )
}
