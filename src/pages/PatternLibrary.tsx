import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Shapes, Plus, Pencil, Trash2, FileSpreadsheet, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Pattern, PatternSet } from '@/lib/types'
import { classNames } from '@/lib/format'
import { PageHeader, EmptyState, LoadingState, Modal } from '@/components/ui'

interface PatternForm {
  id?: string
  name: string
  category: string
  start_signal: string
  end_signal: string
  score: number
  description: string
  keywords: string
  is_active: boolean
}

const EMPTY_FORM: PatternForm = {
  name: '',
  category: 'Hook',
  start_signal: '',
  end_signal: '',
  score: 80,
  description: '',
  keywords: '',
  is_active: true,
}

export default function PatternLibrary() {
  const { user } = useAuth()
  const [sets, setSets] = useState<PatternSet[] | null>(null)
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null)
  const [form, setForm] = useState<PatternForm | null>(null)
  const [newSetName, setNewSetName] = useState('')
  const [showNewSet, setShowNewSet] = useState(false)
  const [renamingSet, setRenamingSet] = useState<PatternSet | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    const [setsRes, patternsRes] = await Promise.all([
      supabase.from('pattern_sets').select('*').order('created_at'),
      supabase.from('patterns').select('*').order('score', { ascending: false }),
    ])
    const allSets = (setsRes.data as PatternSet[]) ?? []
    setSets(allSets)
    setPatterns((patternsRes.data as Pattern[]) ?? [])
    setSelectedSetId((prev) => prev ?? allSets[0]?.id ?? null)
  }

  async function createSet(e: FormEvent) {
    e.preventDefault()
    if (!newSetName.trim()) return
    const { data } = await supabase
      .from('pattern_sets')
      .insert({ user_id: user!.id, name: newSetName.trim() })
      .select()
      .single()
    setNewSetName('')
    setShowNewSet(false)
    await load()
    if (data) setSelectedSetId(data.id)
  }

  async function renameSet(e: FormEvent) {
    e.preventDefault()
    if (!renamingSet) return
    await supabase.from('pattern_sets').update({ name: renamingSet.name }).eq('id', renamingSet.id)
    setRenamingSet(null)
    await load()
  }

  async function deleteSet(set: PatternSet) {
    if (!confirm(`Delete pattern set "${set.name}" and all of its patterns?`)) return
    await supabase.from('pattern_sets').delete().eq('id', set.id)
    setSelectedSetId(null)
    await load()
  }

  async function activateSet(set: PatternSet) {
    await supabase.from('pattern_sets').update({ is_active: false }).neq('id', set.id)
    await supabase.from('pattern_sets').update({ is_active: true }).eq('id', set.id)
    await load()
  }

  async function savePattern(e: FormEvent) {
    e.preventDefault()
    if (!form || !selectedSetId) return
    const payload = {
      pattern_set_id: selectedSetId,
      name: form.name,
      category: form.category,
      start_signal: form.start_signal,
      end_signal: form.end_signal,
      score: form.score,
      description: form.description || null,
      keywords: form.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      is_active: form.is_active,
    }
    if (form.id) {
      await supabase.from('patterns').update(payload).eq('id', form.id)
    } else {
      await supabase.from('patterns').insert(payload)
    }
    setForm(null)
    await load()
  }

  async function deletePattern(p: Pattern) {
    if (!confirm(`Delete pattern "${p.name}"?`)) return
    await supabase.from('patterns').delete().eq('id', p.id)
    await load()
  }

  async function togglePattern(p: Pattern) {
    await supabase.from('patterns').update({ is_active: !p.is_active }).eq('id', p.id)
    await load()
  }

  if (!sets) return <LoadingState />

  const selectedSet = sets.find((s) => s.id === selectedSetId) ?? null
  const patternsInSet = patterns.filter((p) => p.pattern_set_id === selectedSetId)

  return (
    <div>
      <PageHeader
        title="Pattern Library"
        subtitle="Clipping patterns drive AI clip detection and ranking"
        actions={
          <>
            <Link to="/csv-import" className="btn-secondary">
              <FileSpreadsheet className="h-4 w-4" /> Import CSV
            </Link>
            <button
              onClick={() => setForm({ ...EMPTY_FORM })}
              className="btn-primary"
              disabled={!selectedSetId}
            >
              <Plus className="h-4 w-4" /> Create Pattern
            </button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {sets.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedSetId(s.id)}
            className={classNames(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
              s.id === selectedSetId
                ? 'bg-brand-500 text-white'
                : 'bg-surface-800 text-zinc-400 hover:text-zinc-100',
            )}
          >
            {s.name}
            {s.is_active && <CheckCircle2 className="h-3.5 w-3.5" />}
          </button>
        ))}
        <button onClick={() => setShowNewSet(true)} className="btn-ghost">
          <Plus className="h-4 w-4" /> New Set
        </button>
      </div>

      {selectedSet && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">
            {patternsInSet.length} pattern{patternsInSet.length === 1 ? '' : 's'}
          </span>
          {!selectedSet.is_active && (
            <button onClick={() => void activateSet(selectedSet)} className="btn-secondary !py-1 text-xs">
              Set as Active
            </button>
          )}
          <button
            onClick={() => setRenamingSet({ ...selectedSet })}
            className="btn-ghost !py-1 text-xs"
          >
            Rename
          </button>
          <button
            onClick={() => void deleteSet(selectedSet)}
            className="btn-ghost !py-1 text-xs text-red-400"
          >
            Delete Set
          </button>
        </div>
      )}

      {sets.length === 0 ? (
        <EmptyState
          icon={<Shapes className="h-10 w-10" />}
          title="No patterns yet"
          message="Import a CSV or create your first clipping pattern."
          action={
            <button onClick={() => setShowNewSet(true)} className="btn-primary">
              Create Pattern Set
            </button>
          }
        />
      ) : patternsInSet.length === 0 ? (
        <EmptyState
          icon={<Shapes className="h-10 w-10" />}
          title="Empty pattern set"
          message="Import a CSV or create your first clipping pattern."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-700 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Pattern</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Start Signal</th>
                <th className="px-4 py-3">End Signal</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {patternsInSet.map((p) => (
                <tr key={p.id} className="hover:bg-surface-850">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-surface-800 px-2 py-0.5 text-xs">{p.category}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{p.start_signal}</td>
                  <td className="px-4 py-3 text-zinc-400">{p.end_signal}</td>
                  <td className="px-4 py-3 font-semibold text-brand-400">{Math.round(p.score)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void togglePattern(p)}
                      className={classNames(
                        'relative h-5 w-9 rounded-full transition-colors',
                        p.is_active ? 'bg-brand-500' : 'bg-surface-600',
                      )}
                    >
                      <span
                        className={classNames(
                          'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
                          p.is_active ? 'left-4.5' : 'left-0.5',
                        )}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() =>
                          setForm({
                            id: p.id,
                            name: p.name,
                            category: p.category,
                            start_signal: p.start_signal,
                            end_signal: p.end_signal,
                            score: p.score,
                            description: p.description ?? '',
                            keywords: p.keywords.join(', '),
                            is_active: p.is_active,
                          })
                        }
                        className="btn-ghost !px-2"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void deletePattern(p)}
                        className="btn-ghost !px-2 text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showNewSet} onClose={() => setShowNewSet(false)} title="New Pattern Set">
        <form onSubmit={(e) => void createSet(e)} className="space-y-4">
          <div>
            <label className="label">Set Name</label>
            <input
              className="input"
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              placeholder="Viral Hooks"
              autoFocus
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            Create Set
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(renamingSet)}
        onClose={() => setRenamingSet(null)}
        title="Rename Pattern Set"
      >
        <form onSubmit={(e) => void renameSet(e)} className="space-y-4">
          <input
            className="input"
            value={renamingSet?.name ?? ''}
            onChange={(e) => renamingSet && setRenamingSet({ ...renamingSet, name: e.target.value })}
            autoFocus
          />
          <button type="submit" className="btn-primary w-full">
            Save
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edit Pattern' : 'Create Pattern'}
      >
        {form && (
          <form onSubmit={(e) => void savePattern(e)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Pattern Name</label>
                <input
                  className="input"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Category</label>
                <input
                  className="input"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Start Signal</label>
                <input
                  className="input"
                  value={form.start_signal}
                  onChange={(e) => setForm({ ...form, start_signal: e.target.value })}
                />
              </div>
              <div>
                <label className="label">End Signal</label>
                <input
                  className="input"
                  value={form.end_signal}
                  onChange={(e) => setForm({ ...form, end_signal: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Score (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="input"
                  value={form.score}
                  onChange={(e) => setForm({ ...form, score: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Keywords (comma separated)</label>
                <input
                  className="input"
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="h-4 w-4 accent-brand-500"
              />
              Active
            </label>
            <button type="submit" className="btn-primary w-full">
              {form.id ? 'Save Changes' : 'Create Pattern'}
            </button>
          </form>
        )}
      </Modal>
    </div>
  )
}
