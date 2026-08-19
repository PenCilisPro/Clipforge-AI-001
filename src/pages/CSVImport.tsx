import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import { FileSpreadsheet, Upload, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { PatternSet } from '@/lib/types'
import { classNames } from '@/lib/format'
import { PageHeader } from '@/components/ui'

type Step = 'upload' | 'map' | 'preview' | 'done'

const TARGET_FIELDS = [
  { key: 'name', label: 'Pattern Name', required: true },
  { key: 'category', label: 'Category', required: false },
  { key: 'start_signal', label: 'Start Signal', required: false },
  { key: 'end_signal', label: 'End Signal', required: false },
  { key: 'score', label: 'Score', required: false },
  { key: 'description', label: 'Description', required: false },
  { key: 'keywords', label: 'Keywords', required: false },
] as const

type TargetKey = (typeof TARGET_FIELDS)[number]['key']

interface RowError {
  row: number
  message: string
}

function guessMapping(columns: string[]): Record<TargetKey, string | ''> {
  const find = (...candidates: string[]) =>
    columns.find((c) => candidates.some((cand) => c.toLowerCase().trim() === cand)) ?? ''
  return {
    name: find('pattern', 'name', 'pattern name'),
    category: find('category', 'type'),
    start_signal: find('start signal', 'start_signal', 'start'),
    end_signal: find('end signal', 'end_signal', 'end'),
    score: find('score', 'weight'),
    description: find('description', 'notes'),
    keywords: find('keywords', 'tags'),
  }
}

export default function CSVImport() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<TargetKey, string | ''>>(guessMapping([]))
  const [errors, setErrors] = useState<RowError[]>([])
  const [sets, setSets] = useState<PatternSet[]>([])
  const [targetSetId, setTargetSetId] = useState<string>('')
  const [newSetName, setNewSetName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [parseError, setParseError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('pattern_sets')
      .select('*')
      .order('created_at')
      .then(({ data }) => setSets((data as PatternSet[]) ?? []))
  }, [])

  function handleFile(file: File) {
    setParseError(null)
    setFileName(file.name)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length > 0 && result.data.length === 0) {
          setParseError('Could not parse this CSV file. Check the format and try again.')
          return
        }
        const cols = result.meta.fields ?? []
        setColumns(cols)
        setRows(result.data)
        setMapping(guessMapping(cols))
        setStep('map')
      },
      error: () => setParseError('Could not read the file.'),
    })
  }

  function validateRows(): RowError[] {
    const errs: RowError[] = []
    rows.forEach((row, i) => {
      const name = mapping.name ? row[mapping.name]?.trim() : ''
      if (!name) errs.push({ row: i + 1, message: 'Missing pattern name' })
      if (mapping.score) {
        const raw = row[mapping.score]?.trim()
        if (raw && Number.isNaN(Number(raw)))
          errs.push({ row: i + 1, message: `Score "${raw}" is not a number` })
      }
    })
    return errs
  }

  function goToPreview() {
    setErrors(validateRows())
    setStep('preview')
  }

  async function doImport() {
    setImporting(true)
    try {
      let setId = targetSetId
      if (!setId) {
        const { data, error } = await supabase
          .from('pattern_sets')
          .insert({ user_id: user!.id, name: newSetName.trim() || fileName.replace(/\.csv$/i, '') })
          .select()
          .single()
        if (error) throw new Error(error.message)
        setId = data.id
      }

      const invalidRows = new Set(errors.map((e) => e.row))
      const payload = rows
        .map((row, i) => ({ row, index: i + 1 }))
        .filter(({ index }) => !invalidRows.has(index))
        .map(({ row }) => ({
          pattern_set_id: setId,
          name: row[mapping.name]?.trim(),
          category: (mapping.category && row[mapping.category]?.trim()) || 'General',
          start_signal: (mapping.start_signal && row[mapping.start_signal]?.trim()) || '',
          end_signal: (mapping.end_signal && row[mapping.end_signal]?.trim()) || '',
          score: mapping.score && row[mapping.score] ? Number(row[mapping.score]) : 80,
          description: (mapping.description && row[mapping.description]?.trim()) || null,
          keywords:
            mapping.keywords && row[mapping.keywords]
              ? row[mapping.keywords].split(/[;,]/).map((k) => k.trim()).filter(Boolean)
              : [],
        }))

      const { error } = await supabase.from('patterns').insert(payload)
      if (error) throw new Error(error.message)
      setImportedCount(payload.length)
      setStep('done')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  const stepIndex = { upload: 0, map: 1, preview: 2, done: 3 }[step]

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="CSV Pattern Import"
        subtitle="Upload → Validate → Map Columns → Preview → Import"
      />

      <div className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
        {['Upload', 'Map Columns', 'Preview', 'Import'].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={classNames(
                'flex h-6 w-6 items-center justify-center rounded-full text-[11px]',
                i <= stepIndex ? 'bg-brand-500 text-white' : 'bg-surface-700 text-zinc-500',
              )}
            >
              {i + 1}
            </span>
            <span className={i <= stepIndex ? 'text-zinc-200' : 'text-zinc-600'}>{label}</span>
            {i < 3 && <ArrowRight className="h-3 w-3 text-zinc-600" />}
          </div>
        ))}
      </div>

      {parseError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {parseError}
        </div>
      )}

      {step === 'upload' && (
        <label className="card flex cursor-pointer flex-col items-center gap-3 px-6 py-16 text-center transition-colors hover:border-brand-500/50">
          <Upload className="h-8 w-8 text-zinc-500" />
          <p className="font-medium">Upload a CSV file with clipping patterns</p>
          <p className="text-xs text-zinc-500">
            Example columns: Pattern, Start Signal, End Signal, Score, Category
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
        </label>
      )}

      {step === 'map' && (
        <div className="card space-y-5 p-6">
          <p className="text-sm text-zinc-400">
            Detected {columns.length} columns and {rows.length} rows in{' '}
            <span className="text-zinc-200">{fileName}</span>. Map each field to a CSV column.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {TARGET_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="label">
                  {field.label}
                  {field.required && <span className="text-brand-400"> *</span>}
                </label>
                <select
                  className="input"
                  value={mapping[field.key]}
                  onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value })}
                >
                  <option value="">— Not mapped —</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep('upload')} className="btn-secondary">
              Back
            </button>
            <button onClick={goToPreview} disabled={!mapping.name} className="btn-primary">
              Preview Import
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-5">
          {errors.length > 0 && (
            <div className="card border-amber-500/30 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Some rows could not be imported. Review the errors before continuing.
              </p>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-zinc-400">
                {errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-700 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3">Pattern</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Start Signal</th>
                  <th className="px-4 py-3">End Signal</th>
                  <th className="px-4 py-3">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {rows.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 font-medium">
                      {mapping.name ? row[mapping.name] : '—'}
                    </td>
                    <td className="px-4 py-2.5">{mapping.category ? row[mapping.category] : '—'}</td>
                    <td className="px-4 py-2.5 text-zinc-400">
                      {mapping.start_signal ? row[mapping.start_signal] : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">
                      {mapping.end_signal ? row[mapping.end_signal] : '—'}
                    </td>
                    <td className="px-4 py-2.5">{mapping.score ? row[mapping.score] : '80'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <p className="border-t border-surface-800 px-4 py-2 text-xs text-zinc-500">
                … and {rows.length - 10} more rows
              </p>
            )}
          </div>

          <div className="card space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Import into existing set</label>
                <select
                  className="input"
                  value={targetSetId}
                  onChange={(e) => setTargetSetId(e.target.value)}
                >
                  <option value="">Create a new set</option>
                  {sets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {!targetSetId && (
                <div>
                  <label className="label">New set name</label>
                  <input
                    className="input"
                    value={newSetName}
                    onChange={(e) => setNewSetName(e.target.value)}
                    placeholder={fileName.replace(/\.csv$/i, '')}
                  />
                </div>
              )}
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep('map')} className="btn-secondary">
                Back
              </button>
              <button onClick={() => void doImport()} disabled={importing} className="btn-primary">
                <FileSpreadsheet className="h-4 w-4" />
                Import {rows.length - errors.length} Patterns
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="card flex flex-col items-center gap-4 px-6 py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          <h2 className="text-lg font-semibold">Imported {importedCount} patterns</h2>
          <p className="text-sm text-zinc-400">
            Your patterns are stored and will influence clip detection and ranking.
          </p>
          <button onClick={() => navigate('/patterns')} className="btn-primary">
            Open Pattern Library
          </button>
        </div>
      )}
    </div>
  )
}
