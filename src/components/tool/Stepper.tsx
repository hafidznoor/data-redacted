import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import type { Step } from './steps'
import { STEP_ORDER } from './steps'

/**
 * Wizard progress.
 *
 * rare-ui's step-player was the plan's first choice, but reading its source it
 * is a media transport (play / pause / replay) rather than a wizard indicator,
 * and it pulls in flubber for SVG path morphing. Wrong tool, real cost.
 */
export function Stepper({ current, reachable, onJump }: {
  current: Step
  reachable: Set<Step>
  onJump: (step: Step) => void
}) {
  const { t } = useTranslation()
  const currentIndex = STEP_ORDER.indexOf(current)

  return (
    /*
     * Tighter connectors and padding on a phone so five steps fit; the
     * overflow-x-auto is the backstop for longer translations, which keeps a
     * wide stepper scrolling inside itself instead of widening the page.
     */
    <ol className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto text-xs [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {STEP_ORDER.map((step, i) => {
        const done = i < currentIndex
        const active = step === current
        const canJump = reachable.has(step) && !active
        return (
          <li key={step} className="flex shrink-0 items-center gap-1">
            {i > 0 && <span className={cn('h-px w-2 sm:w-4', done || active ? 'bg-foreground/40' : 'bg-border')} />}
            <button
              type="button"
              disabled={!canJump}
              onClick={() => canJump && onJump(step)}
              className={cn(
                'rounded-full px-2 py-1 whitespace-nowrap transition-colors sm:px-2.5',
                active && 'bg-foreground text-background font-medium',
                !active && done && 'text-foreground hover:bg-muted',
                !active && !done && 'text-muted-foreground',
                canJump && 'cursor-pointer',
              )}
              aria-current={active ? 'step' : undefined}
            >
              {t(`steps.${step}`)}
            </button>
          </li>
        )
      })}
    </ol>
  )
}
