import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import type { ColumnProfile } from '@/lib/detect'
import type { ColumnPlan, RedactMode } from '@/lib/redact/types'

const MODES: RedactMode[] = ['blank', 'partial', 'hash', 'fake']

interface Props {
  profiles: ColumnProfile[]
  plans: ColumnPlan[]
  onChange: (index: number, patch: Partial<ColumnPlan>) => void
  onBulk: (select: boolean) => void
}

function confidenceTone(score: number) {
  if (score >= 0.8) return 'bg-destructive/15 text-destructive'
  if (score >= 0.5) return 'bg-warning/20 text-warning-foreground'
  return 'bg-muted text-muted-foreground'
}

/**
 * Per-column decisions.
 *
 * Detection pre-checks likely columns and suggests a mode, but every row shows
 * its score and reasoning so the suggestion can be judged rather than trusted.
 * Nothing is redacted without an explicit tick.
 */
export function ColumnMapper({ profiles, plans, onChange, onBulk }: Props) {
  const { t } = useTranslation()
  const planFor = (i: number) => plans.find((p) => p.index === i)
  const selectedCount = plans.filter((p) => p.mode !== null).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {t('columns.selected', { count: selectedCount, total: profiles.length })}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onBulk(true)}>{t('columns.selectAll')}</Button>
          <Button variant="outline" size="sm" onClick={() => onBulk(false)}>{t('columns.clear')}</Button>
        </div>
      </div>

      <div className="divide-border divide-y rounded-lg border">
        {profiles.map((profile) => {
          const plan = planFor(profile.index)
          const active = plan?.mode !== null && plan?.mode !== undefined
          const hashingLowCardinality = active && plan?.mode === 'hash' && profile.lowCardinality

          return (
            <div
              key={profile.index}
              className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-4', active && 'bg-muted/40')}
            >
              <Checkbox
                checked={active}
                onCheckedChange={(checked) =>
                  onChange(profile.index, { mode: checked ? profile.suggestedMode : null })
                }
                aria-label={t('columns.toggle', { header: profile.header })}
              />

              <div className="min-w-[140px] flex-1 sm:min-w-[180px]">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{profile.header}</span>
                  {profile.semantic !== 'unknown' && (
                    <Badge variant="outline" className="text-[10px]">
                      {t(`semantic.${profile.semantic}`)}
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground truncate text-xs">
                  {profile.samples.join(' · ') || t('columns.empty')}
                </p>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'cursor-help rounded px-2 py-0.5 text-[11px] font-medium tabular-nums',
                      confidenceTone(profile.score),
                    )}
                  >
                    {Math.round(profile.score * 100)}%
                  </span>
                </TooltipTrigger>
                <TooltipContent>{profile.reason}</TooltipContent>
              </Tooltip>

              {active && (
                <Select
                  value={plan!.mode!}
                  onValueChange={(mode) => onChange(profile.index, { mode: mode as RedactMode })}
                >
                  <SelectTrigger className="w-full sm:w-[140px]" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>{t(`mode.${mode}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {hashingLowCardinality && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-warning-foreground bg-warning/20 flex items-center gap-1 rounded px-2 py-1 text-[11px]">
                      <AlertTriangle className="size-3" />
                      {t('columns.lowCardinality')}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {t('columns.lowCardinalityHelp', { count: profile.distinctCount })}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
