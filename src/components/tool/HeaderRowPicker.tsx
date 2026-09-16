import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import type { HeaderRowResult } from '@/lib/detect'

interface Props {
  sheet: string
  guess: HeaderRowResult | undefined
  value: number
  onChange: (index: number) => void
}

/**
 * Header row confirmation.
 *
 * Detection shows its working — every candidate row and its score — because a
 * silently wrong header row corrupts every downstream decision, and the user
 * is the only one who can actually tell.
 */
export function HeaderRowPicker({ sheet, guess, value, onChange }: Props) {
  const { t } = useTranslation()
  const inconclusive = !guess || guess.index === null
  const candidates = guess?.scores ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <span className="text-sm font-medium">{t('header.label', { sheet })}</span>
        <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
          <SelectTrigger className="w-full min-w-0 sm:w-[420px] sm:max-w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((c) => (
              <SelectItem key={c.index} value={String(c.index)}>
                <span className="shrink-0 tabular-nums">{t('header.row', { n: c.index + 1 })}</span>
                {' — '}
                <span className="truncate opacity-70">
                  {c.preview.filter(Boolean).join(', ').slice(0, 60) || t('header.blank')}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Alert>
        <Info className="size-4" />
        <AlertDescription>
          {inconclusive
            ? t('header.inconclusive')
            : t('header.detected', {
                n: (guess!.index ?? 0) + 1,
                pct: Math.round(guess!.confidence * 100),
              })}
        </AlertDescription>
      </Alert>
    </div>
  )
}
