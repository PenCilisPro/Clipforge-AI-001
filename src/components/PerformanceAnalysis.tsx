import { useState } from 'react'
import Papa from 'papaparse'
import { FileSpreadsheet, Sparkles, Plus, CheckCircle2, AlertTriangle } from 'lucide-react'
import { supabase, invokeFunction } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { classNames } from '@/lib/format'

interface SuggestedPattern {
  name: string
  category: string
  start_signal: string
  end_signal: string
  score: number
  description: string
  keywords: string[]
}

interface AnalysisResult {
  insights: string
  patterns: SuggestedPattern[]
  model: string
}

type Platform = 'tiktok' | 'youtube'

function parseCsv(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length > 0 && result.data.length === 0) {
          reject(new Error('Could not parse this CSV file.'))
          return
        }
        resolve(result.data)
      },
      error: () => reject(new Error('Could not read the file.')),
    })
  })
}

export default function PerformanceAnalysis() {
  const { user } = useAuth()
  const [files, setFiles] = useState<Record<Platform, { name: string; rows: Record<string, string>[] } | null>>({
    tiktok: null,
    youtube: null,
  })
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importedSet, setImportedSet] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(platform: Platform, file: File) {
    setError(null)
    try {
      const rows = await parseCsv(file)
      setFiles((prev) => ({ ...prev, [platform]: { name: file.name, rows } }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the file.')
    }
  }

  async function analyze() {
    setAnalyzing(true)
    setError(null)
    setResult(null)
    setImportedSet(null)
    try {
      const data = await invokeFunction<AnalysisResult>('analyze-performance', {
        tiktokRows: files.tiktok?.rows ?? [],
        youtubeRows: files.youtube?.rows ?? [],
      })
      setResult(data)
      setSelected(new Set(data.patterns.map((_, i) => i)))
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Analysis failed. Make sure OPENROUTER_API_KEY is configured in Supabase Edge Function secrets.',
      )
    } finally {
      setAnalyzing(false)
    }
  }

  async function importSelected() {
    if (!result || selected.size === 0) return
    setImporting(true)
    setError(null)
    try {
      const setName = `AI Analyzed Patterns ${new Date().toLocaleDateString()}`
      const { data: setRow, error: setError_ } = await supabase
        .from('pattern_sets')
        .insert({ user_id: user!.id, name: setName })
        .select()
        .single()
      if (setError_) throw new Error(setError_.message)
      const rows = result.patterns
        .filter((_, i) => selected.has(i))
        .map((p) => ({
          pattern_set_id: setRow.id,
          name: p.name,
          category: p.category,
          start_signal: p.start_signal,
          end_signal: p.end_signal,
          score: p.score,
          description: p.description,
          keywords: p.keywords,
          is_active: true,
        }))
      const { error: insError } = await supabase.from('patterns').insert(rows)
      if (insError) throw new Error(insError.message)
      setImportedSet(setName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  const hasData = Boolean(files.tiktok || files.youtube)

  return (
    <section className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        <Sparkles className="h-4 w-4 text-brand-400" /> Performance Pattern Analysis
      </h2>
      <p className="mb-4 text-xs text-zinc-500">
        Upload your TikTok and YouTube analytics CSV exports. Claude analyzes what performs best
        and suggests clipping patterns you can add to your Pattern Library.
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {(['tiktok', 'youtube'] as Platform[]).map((platform) => (
          <label
            key={platform}
            className={classNames(
              'flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 transition-colors',
              files[platform]
                ? 'border-brand-500/60 bg-brand-500/5'
                : 'border-surface-700 hover:border-brand-500/40',
            )}
          >
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-brand-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium capitalize">{platform} CSV</p>
              <p className="truncate text-xs text-zinc-500">
                {files[platform]
                  ? `${files[platform]!.name} · ${files[platform]!.rows.length} rows`
                  : 'Click to upload analytics export'}
              </p>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(platform, file)
                e.target.value = ''
              }}
            />
          </label>
        ))}
      </div>

      <button
        className="btn-primary"
        disabled={!hasData || analyzing}
        onClick={() => void analyze()}
      >
        {analyzing ? 'Analyzing with Claude…' : 'Analyze with Claude'}
      </button>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-surface-700 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Insights <span className="normal-case text-zinc-600">({result.model})</span>
            </h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
              {result.insights || 'No insights returned.'}
            </p>
          </div>

          {result.patterns.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Suggested Patterns
              </h3>
              <div className="space-y-2">
                {result.patterns.map((p, i) => (
                  <label
                    key={i}
                    className={classNames(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                      selected.has(i)
                        ? 'border-brand-500/60 bg-brand-500/5'
                        : 'border-surface-700',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 accent-brand-500"
                      checked={selected.has(i)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (next.has(i)) next.delete(i)
                          else next.add(i)
                          return next
                        })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{p.name}</span>
                        <span className="rounded-full bg-surface-800 px-2 py-0.5 text-xs text-zinc-400">
                          {p.category}
                        </span>
                        <span className="text-xs font-medium text-brand-400">Score {p.score}</span>
                      </div>
                      {p.description && (
                        <p className="mt-1 text-xs text-zinc-400">{p.description}</p>
                      )}
                      {p.keywords.length > 0 && (
                        <p className="mt-1 text-xs text-zinc-600">{p.keywords.join(' · ')}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  className="btn-primary"
                  disabled={selected.size === 0 || importing}
                  onClick={() => void importSelected()}
                >
                  <Plus className="h-4 w-4" />
                  {importing
                    ? 'Adding…'
                    : `Add ${selected.size} pattern${selected.size === 1 ? '' : 's'} to Library`}
                </button>
                {importedSet && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> Added to “{importedSet}”
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
