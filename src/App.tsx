import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import MatrixOrb from '@/components/ui/matrix-orb'
import { Dropzone } from '@/components/tool/Dropzone'
import { SheetPicker } from '@/components/tool/SheetPicker'
import { HeaderRowPicker } from '@/components/tool/HeaderRowPicker'
import { ColumnMapper } from '@/components/tool/ColumnMapper'
import { PreviewTable } from '@/components/tool/PreviewTable'
import { AuditSummary } from '@/components/tool/AuditSummary'
import { Stepper } from '@/components/tool/Stepper'
import type { Step } from '@/components/tool/steps'
import { useRedactionWorker } from '@/lib/useRedactionWorker'
import { setLanguage, LANGUAGES, type Language } from '@/i18n'
import type { ColumnProfile, HeaderRowResult } from '@/lib/detect'
import type { ColumnPlan, Locale } from '@/lib/redact/types'
import type { SheetSummary } from '@/lib/excel/read'
import type {
  AuditReport, ExportFormat, ExportScope, PreviewRow, SheetJob,
} from '@/workers/protocol'
import { AlertTriangle, Download, ShieldCheck } from 'lucide-react'

const PREVIEW_ROWS = 60

interface SheetState {
  headerRow: number
  headers: string[]
  profiles: ColumnProfile[]
  plans: ColumnPlan[]
}

export default function App() {
  const { t, i18n } = useTranslation()
  const { send, progress, setProgress } = useRedactionWorker()

  const [step, setStep] = useState<Step>('drop')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState<SheetSummary[]>([])
  const [guesses, setGuesses] = useState<Record<string, HeaderRowResult>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scope, setScope] = useState<ExportScope>('selected-only')
  const [sheetState, setSheetState] = useState<Record<string, SheetState>>({})
  const [activeSheet, setActiveSheet] = useState('')

  const [preview, setPreview] = useState<{ headers: string[]; rows: PreviewRow[] } | null>(null)
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [locale, setLocale] = useState<Locale>(i18n.language.startsWith('id') ? 'id' : 'en')
  const [result, setResult] = useState<{ audit: AuditReport; fileName: string } | null>(null)

  const reset = () => {
    setStep('drop'); setSheets([]); setGuesses({}); setSelected(new Set())
    setSheetState({}); setActiveSheet(''); setPreview(null); setResult(null)
    setError(null); setProgress(null); setFileName(''); setScope('selected-only')
  }

  /** Load a sheet's headers and column profiles, once, on demand. */
  const ensureAnalyzed = useCallback(
    async (sheet: string, headerRow: number, force = false) => {
      if (!force && sheetState[sheet]?.headers.length) return sheetState[sheet]
      const res = await send(
        { type: 'analyze', sheet, headerRow },
      )
      const next: SheetState = {
        headerRow,
        headers: res.headers,
        profiles: res.columns,
        // Pre-check what detection is confident about; everything else starts off.
        plans: res.columns.map((c) => ({
          index: c.index,
          header: c.header,
          semantic: c.semantic,
          mode: c.score >= 0.5 ? c.suggestedMode : null,
          options: { locale, consistent: true },
        })),
      }
      setSheetState((prev) => ({ ...prev, [sheet]: next }))
      return next
    },
    [send, sheetState, locale],
  )

  const handleFile = async (file: File) => {
    setBusy(true); setError(null)
    try {
      const res = await send({ type: 'load', file })

      setFileName(res.fileName)
      setSheets(res.sheets)
      setGuesses(res.headerGuesses)

      const withData = res.sheets.filter((s) => s.rowCount > 1)
      const initial = new Set(withData.map((s) => s.name))
      setSelected(initial)
      const first = withData[0]?.name ?? res.sheets[0]?.name ?? ''
      setActiveSheet(first)

      // Collapse steps that have only one sensible answer. Both decisions stay
      // visible and editable from the stepper — skipped, not hidden.
      const onlyOneSheet = res.sheets.length === 1
      const confident = first ? res.headerGuesses[first]?.index !== null : false
      if (onlyOneSheet && confident) {
        await ensureAnalyzed(first, res.headerGuesses[first]!.index!)
        setStep('columns')
      } else {
        setStep(onlyOneSheet ? 'header' : 'sheets')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'))
    } finally {
      setBusy(false)
    }
  }

  const selectedList = useMemo(() => sheets.filter((s) => selected.has(s.name)), [sheets, selected])
  const state = sheetState[activeSheet]

  const goToColumns = async () => {
    setBusy(true)
    try {
      for (const sheet of selectedList) {
        const guess = guesses[sheet.name]
        await ensureAnalyzed(sheet.name, sheetState[sheet.name]?.headerRow ?? guess?.index ?? 0)
      }
      setStep('columns')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'))
    } finally {
      setBusy(false)
    }
  }

  const updatePlan = (sheet: string, index: number, patch: Partial<ColumnPlan>) => {
    setSheetState((prev) => ({
      ...prev,
      [sheet]: {
        ...prev[sheet],
        plans: prev[sheet].plans.map((p) => (p.index === index ? { ...p, ...patch } : p)),
      },
    }))
    setPreview(null)
  }

  const bulkSelect = (sheet: string, select: boolean) => {
    setSheetState((prev) => ({
      ...prev,
      [sheet]: {
        ...prev[sheet],
        plans: prev[sheet].plans.map((p, i) => ({
          ...p,
          mode: select ? prev[sheet].profiles[i].suggestedMode : null,
        })),
      },
    }))
    setPreview(null)
  }

  const jobs = useMemo<SheetJob[]>(
    () => selectedList
      .filter((s) => sheetState[s.name])
      .map((s) => ({
        sheet: s.name,
        headerRow: sheetState[s.name].headerRow,
        plans: sheetState[s.name].plans.map((p) => ({ ...p, options: { ...p.options, locale } })),
      })),
    [selectedList, sheetState, locale],
  )

  const totalColumns = jobs.reduce((n, j) => n + j.plans.filter((p) => p.mode !== null).length, 0)

  const loadPreview = async () => {
    if (!state) return
    setBusy(true)
    try {
      const res = await send({
        type: 'preview',
        sheet: activeSheet,
        headerRow: state.headerRow,
        plans: state.plans.map((p) => ({ ...p, options: { ...p.options, locale } })),
        limit: PREVIEW_ROWS,
      })
      setPreview(res)
      setStep('export')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'))
    } finally {
      setBusy(false)
    }
  }

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    // Revoked on the next tick: revoking synchronously can cancel the download
    // in some browsers before it has started reading the blob.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const runExport = async () => {
    setBusy(true); setError(null)
    try {
      const res = await send({
        type: 'export', jobs, scope, format,
      })
      download(res.blob, res.fileName)
      setResult({ audit: res.audit, fileName: res.fileName })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'))
    } finally {
      setBusy(false); setProgress(null)
    }
  }

  const downloadAudit = () => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result.audit, null, 2)], { type: 'application/json' })
    download(blob, result.fileName.replace(/\.[^.]+$/, '') + '-audit.json')
  }

  const reachable = useMemo(() => {
    const set = new Set<Step>(['drop'])
    if (sheets.length) { set.add('sheets'); set.add('header') }
    if (Object.keys(sheetState).length) set.add('columns')
    if (preview) set.add('export')
    return set
  }, [sheets, sheetState, preview])

  const changedColumns = useMemo(
    () => new Set((state?.plans ?? []).filter((p) => p.mode !== null).map((p) => p.index)),
    [state],
  )

  const unpickedNames = sheets.filter((s) => !selected.has(s.name)).map((s) => s.name)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-dvh">
        <header className="border-b">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
            <div className="flex-1">
              <h1 className="font-mono text-sm font-semibold tracking-tight">{t('app.title')}</h1>
              <p className="text-muted-foreground text-xs">{t('app.tagline')}</p>
            </div>

            <span className="text-success bg-success/10 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium">
              <ShieldCheck className="size-3.5" />
              {t('app.badge')}
            </span>

            <Select
              value={i18n.language.startsWith('id') ? 'id' : 'en'}
              onValueChange={(v) => setLanguage(v as Language)}
            >
              <SelectTrigger size="sm" className="w-[150px]" aria-label={t("app.language")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LANGUAGES).map(([code, label]) => (
                  <SelectItem key={code} value={code}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
          {step !== 'drop' && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Stepper current={step} reachable={reachable} onJump={setStep} />
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground max-w-[220px] truncate font-mono text-xs">{fileName}</span>
                <Button variant="ghost" size="sm" onClick={reset}>{t('app.startOver')}</Button>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>{t('error.title')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {busy && (
            <div className="flex flex-col items-center gap-3 py-6">
              <MatrixOrb state="thinking" size={72} />
              <p className="text-muted-foreground text-xs">
                {progress ? `${progress.phase} — ${Math.round(progress.pct * 100)}%` : t('drop.reading')}
              </p>
            </div>
          )}

          {step === 'drop' && !busy && (
            <div className="py-12">
              <Dropzone onFile={handleFile} busy={busy} />
            </div>
          )}

          {step === 'sheets' && !busy && (
            <section className="space-y-5">
              <h2 className="text-lg font-medium">{t('sheets.title')}</h2>
              <SheetPicker
                sheets={sheets}
                selected={selected}
                scope={scope}
                onScopeChange={setScope}
                onToggle={(name) =>
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (next.has(name)) next.delete(name)
                    else next.add(name)
                    return next
                  })
                }
              />
              <div className="flex justify-end">
                <Button onClick={() => setStep('header')} disabled={!selected.size}>
                  {t('app.next')}
                </Button>
              </div>
            </section>
          )}

          {step === 'header' && !busy && (
            <section className="space-y-5">
              <h2 className="text-lg font-medium">{t('header.title')}</h2>
              {selectedList.map((sheet) => (
                <HeaderRowPicker
                  key={sheet.name}
                  sheet={sheet.name}
                  guess={guesses[sheet.name]}
                  value={sheetState[sheet.name]?.headerRow ?? guesses[sheet.name]?.index ?? 0}
                  onChange={(index) => {
                    setSheetState((prev) => ({
                      ...prev,
                      [sheet.name]: { ...(prev[sheet.name] ?? { headers: [], profiles: [], plans: [] }), headerRow: index },
                    }))
                    void ensureAnalyzed(sheet.name, index, true)
                  }}
                />
              ))}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep('sheets')}>{t('app.back')}</Button>
                <Button onClick={goToColumns}>{t('app.next')}</Button>
              </div>
            </section>
          )}

          {step === 'columns' && !busy && state && (
            <section className="space-y-5">
              <h2 className="text-lg font-medium">{t('columns.title')}</h2>

              {selectedList.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedList.map((s) => (
                    <Button
                      key={s.name}
                      size="sm"
                      variant={s.name === activeSheet ? 'default' : 'outline'}
                      onClick={() => { setActiveSheet(s.name); setPreview(null) }}
                    >
                      {s.name}
                    </Button>
                  ))}
                </div>
              )}

              <ColumnMapper
                profiles={state.profiles}
                plans={state.plans}
                onChange={(index, patch) => updatePlan(activeSheet, index, patch)}
                onBulk={(select) => bulkSelect(activeSheet, select)}
              />

              <p className="text-muted-foreground text-xs leading-relaxed">{t('columns.disclaimer')}</p>

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep('header')}>{t('app.back')}</Button>
                <Button onClick={loadPreview} disabled={!totalColumns}>{t('app.next')}</Button>
              </div>
            </section>
          )}

          {step === 'export' && !busy && (
            <section className="space-y-6">
              <h2 className="text-lg font-medium">{t('preview.title')}</h2>

              {preview && (
                <PreviewTable headers={preview.headers} rows={preview.rows} changedColumns={changedColumns} />
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">{t('export.format')}</span>
                  <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="xlsx">{t('export.xlsx')}</SelectItem>
                      <SelectItem value="csv">{t('export.csv')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {format === 'csv' && (
                    <span className="text-muted-foreground block text-xs">{t('export.csvNote')}</span>
                  )}
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium">{t('export.locale')}</span>
                  <Select value={locale} onValueChange={(v) => { setLocale(v as Locale); setPreview(null) }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="id">{t('export.localeId')}</SelectItem>
                      <SelectItem value="en">{t('export.localeEn')}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t('export.confirmTitle')}</p>
                  <p className="text-muted-foreground text-xs">
                    {t('export.confirmColumns', { count: totalColumns })}{' '}
                    {t('export.confirmSheets', { count: jobs.length })}
                  </p>
                  {scope === 'whole-workbook' && unpickedNames.length > 0 && (
                    <p className="text-destructive text-xs font-medium">
                      {t('export.confirmPassThrough', { sheets: unpickedNames.join(', ') })}
                    </p>
                  )}
                </div>

                {/*
                  rare-ui's DeleteButton was the plan's choice here, but it renders
                  as an unlabeled trash icon: the wrong metaphor for "produce a new
                  file", and unreadable without hovering. Exporting also is not
                  destructive — the original file is untouched — so a confirm step
                  would add friction without buying any safety.
                */}
                <Button size="lg" onClick={runExport} disabled={busy || !totalColumns}>
                  <Download className="size-4" />
                  {busy ? t('export.working') : t('export.run')}
                </Button>
              </div>

              {result && <AuditSummary audit={result.audit} onDownload={downloadAudit} />}

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep('columns')}>{t('app.back')}</Button>
                {result && <Button variant="outline" onClick={reset}>{t('app.startOver')}</Button>}
              </div>
            </section>
          )}
        </main>

        <footer className="text-muted-foreground mx-auto max-w-5xl px-4 py-8 text-center text-xs">
          <p>MIT · github.com/hafidznoor/data-redacted</p>
        </footer>
      </div>
    </TooltipProvider>
  )
}
