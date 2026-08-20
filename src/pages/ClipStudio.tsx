import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Clapperboard,
  Film,
  History,
  Loader2,
  Music,
  Save,
  Search,
  Sparkles,
  Trash2,
  Type,
  Video as VideoIcon,
} from 'lucide-react'
import { supabase, invokeFunction } from '@/lib/supabase'
import type {
  BrollConfigItem,
  CaptionStyle,
  Clip,
  ClipConfiguration,
  ClipVersion,
  RenderJob,
} from '@/lib/types'
import { defaultClipConfiguration } from '@/lib/types'
import { saveConfigurationAsVersion, createRenderJob, restoreVersion } from '@/lib/render'
import { classNames, formatDuration, formatTimestamp } from '@/lib/format'
import { LoadingState, ProgressBar, StatusBadge } from '@/components/ui'
import { RemotionPlayerPreview } from '@/components/remotion/RemotionPlayerPreview'

type Tab = 'video' | 'captions' | 'broll' | 'music'

interface BrollSearchResult {
  provider: string
  externalId: string
  videoUrl: string
  previewImageUrl: string | null
}

interface MusicSearchResult {
  externalId: string
  title: string
  artist: string
  audioUrl: string
  duration: number
}

export default function ClipStudio() {
  const { clipId } = useParams<{ clipId: string }>()
  const [clip, setClip] = useState<Clip | null>(null)
  const [config, setConfig] = useState<ClipConfiguration | null>(null)
  const [versions, setVersions] = useState<ClipVersion[]>([])
  const [activeJob, setActiveJob] = useState<RenderJob | null>(null)
  const [tab, setTab] = useState<Tab>('video')
  const [saving, setSaving] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const [brollQuery, setBrollQuery] = useState('')
  const [brollResults, setBrollResults] = useState<BrollSearchResult[]>([])
  const [brollSearching, setBrollSearching] = useState(false)
  const [brollError, setBrollError] = useState<string | null>(null)

  const [musicQuery, setMusicQuery] = useState('')
  const [musicResults, setMusicResults] = useState<MusicSearchResult[]>([])
  const [musicSearching, setMusicSearching] = useState(false)
  const [musicError, setMusicError] = useState<string | null>(null)

  const [previewMode, setPreviewMode] = useState<'live' | 'rendered'>('live')

  const load = useCallback(async () => {
    if (!clipId) return
    const [clipRes, versionsRes, jobsRes] = await Promise.all([
      supabase.from('clips').select('*').eq('id', clipId).single(),
      supabase
        .from('clip_versions')
        .select('*')
        .eq('clip_id', clipId)
        .order('version_number', { ascending: false }),
      supabase
        .from('render_jobs')
        .select('*')
        .eq('clip_id', clipId)
        .in('status', ['QUEUED', 'PREPARING', 'RENDERING', 'UPLOADING'])
        .order('created_at', { ascending: false })
        .limit(1),
    ])
    const loadedClip = clipRes.data as Clip | null
    const loadedVersions = (versionsRes.data as ClipVersion[]) ?? []
    setClip(loadedClip)
    setVersions(loadedVersions)
    setActiveJob(((jobsRes.data as RenderJob[]) ?? [])[0] ?? null)

    setConfig((prev) => {
      if (prev) return prev
      const current =
        loadedVersions.find((v) => v.id === loadedClip?.current_version_id) ?? loadedVersions[0]
      if (current && Object.keys(current.configuration_json).length > 0)
        return current.configuration_json
      if (loadedClip)
        return defaultClipConfiguration('', loadedClip.start_time, loadedClip.end_time)
      return prev
    })
  }, [clipId])

  useEffect(() => {
    void load()
  }, [load])

  // Poll while a render job is active so the new MP4 appears automatically.
  useEffect(() => {
    if (!activeJob) return
    const interval = setInterval(() => void load(), 3000)
    return () => clearInterval(interval)
  }, [activeJob, load])

  const currentVersion = useMemo(
    () => versions.find((v) => v.id === clip?.current_version_id) ?? null,
    [versions, clip],
  )

  async function handleSave(): Promise<ClipVersion | null> {
    if (!clip || !config) return null
    setSaving(true)
    setError(null)
    try {
      const version = await saveConfigurationAsVersion(clip, config)
      await load()
      return version
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration.')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function handleRender() {
    if (!clip) return
    setRendering(true)
    setError(null)
    try {
      const version = await handleSave()
      if (!version) return
      const job = await createRenderJob(clip, version)
      await invokeFunction('start-render', { renderJobId: job.id }).catch(() => {
        // The render worker also polls for QUEUED jobs.
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start render.')
    } finally {
      setRendering(false)
    }
  }

  async function searchBroll() {
    if (!brollQuery.trim()) return
    setBrollSearching(true)
    setBrollError(null)
    try {
      const res = await invokeFunction<{ results: BrollSearchResult[] }>('broll-search', {
        query: brollQuery.trim(),
      })
      setBrollResults(res.results)
    } catch {
      setBrollError('B-roll search failed. Retry or continue without B-roll.')
    } finally {
      setBrollSearching(false)
    }
  }

  async function searchMusic() {
    setMusicSearching(true)
    setMusicError(null)
    try {
      const res = await invokeFunction<{ results: MusicSearchResult[] }>('music-search', {
        query: musicQuery.trim(),
      })
      setMusicResults(res.results)
    } catch {
      setMusicError('Music search failed. Retry or continue without music.')
    } finally {
      setMusicSearching(false)
    }
  }

  if (!clip || !config) return <LoadingState label="Loading Clip Studio…" />

  const clipDuration = config.endTime - config.startTime

  const update = (patch: Partial<ClipConfiguration>) => setConfig({ ...config, ...patch })
  const updateStyle = (patch: Partial<CaptionStyle>) =>
    setConfig({
      ...config,
      captions: { ...config.captions, style: { ...config.captions.style, ...patch } },
    })

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={`/projects/${clip.project_id}`} className="btn-ghost !px-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-bold">{clip.title}</h1>
            <p className="text-xs text-zinc-500">
              Clip Studio · {formatDuration(clip.duration)} ·{' '}
              {clip.matched_pattern_name ?? 'No pattern'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHistory(!showHistory)} className="btn-secondary">
            <History className="h-4 w-4" /> Versions ({versions.length})
          </button>
          <button onClick={() => void handleSave()} disabled={saving} className="btn-secondary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Configuration
          </button>
          <button
            onClick={() => void handleRender()}
            disabled={rendering || Boolean(activeJob)}
            className="btn-primary"
          >
            {rendering || activeJob ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Clapperboard className="h-4 w-4" />
            )}
            Render Clip
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {activeJob && (
        <div className="card mb-4 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-brand-400">
              {activeJob.stage ?? 'Rendering with Remotion…'}
            </span>
            <span className="tabular-nums text-zinc-400">{Math.round(activeJob.progress)}%</span>
          </div>
          <ProgressBar value={activeJob.progress} />
        </div>
      )}

      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(240px,320px)_1fr_minmax(280px,360px)]">
        {/* LEFT: vertical preview */}
        <div className="card flex flex-col items-center justify-between p-4">
          <div className="mb-3 flex w-full items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Preview
            </span>
            {clip.current_render_url && (
              <div className="flex rounded-lg bg-surface-800 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setPreviewMode('live')}
                  className={classNames(
                    'flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors',
                    previewMode === 'live'
                      ? 'bg-brand-500 text-white'
                      : 'text-zinc-400 hover:text-zinc-200',
                  )}
                >
                  <Sparkles className="h-3 w-3" /> Live
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('rendered')}
                  className={classNames(
                    'flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors',
                    previewMode === 'rendered'
                      ? 'bg-brand-500 text-white'
                      : 'text-zinc-400 hover:text-zinc-200',
                  )}
                >
                  <Film className="h-3 w-3" /> MP4
                </button>
              </div>
            )}
          </div>

          <div className="flex w-full flex-1 flex-col items-center justify-center">
            {previewMode === 'live' || !clip.current_render_url ? (
              <RemotionPlayerPreview config={config} />
            ) : (
              <video
                key={clip.current_render_url}
                src={clip.current_render_url}
                controls
                className="aspect-[9/16] w-full max-w-[280px] rounded-lg bg-black object-contain shadow-2xl"
              />
            )}
          </div>

          {currentVersion && (
            <p className="mt-3 text-xs text-zinc-500">
              Version {currentVersion.version_number} ·{' '}
              {previewMode === 'live' ? 'Live Remotion View' : 'Rendered MP4 Output'}
            </p>
          )}
        </div>

        {/* CENTER: timeline */}
        <div className="flex flex-col gap-4">
          <div className="card p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Timeline
            </h2>
            <div className="relative h-16 rounded-lg bg-surface-850">
              <div className="absolute inset-y-2 left-2 right-2 rounded bg-brand-500/25">
                <div className="flex h-full items-center justify-between px-3 text-xs font-medium text-brand-300">
                  <span>{formatTimestamp(config.startTime)}</span>
                  <span>Voice 100%</span>
                  <span>{formatTimestamp(config.endTime)}</span>
                </div>
              </div>
            </div>
            <div className="relative mt-2 h-8 rounded-lg bg-surface-850">
              {config.broll.map((b, i) => {
                const left = (b.startAt / clipDuration) * 100
                const width = (b.duration / clipDuration) * 100
                return (
                  <div
                    key={i}
                    className="absolute inset-y-1 rounded bg-sky-500/40 px-1 text-[10px] leading-6 text-sky-200"
                    style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                    title={b.query ?? 'B-roll'}
                  >
                    B-roll
                  </div>
                )
              })}
              {config.broll.length === 0 && (
                <p className="px-3 text-[11px] leading-8 text-zinc-600">B-roll track</p>
              )}
            </div>
            <div className="relative mt-2 h-8 rounded-lg bg-surface-850">
              {config.music ? (
                <div className="absolute inset-1 rounded bg-emerald-500/30 px-2 text-[11px] leading-6 text-emerald-200">
                  ♪ {config.music.title ?? 'Music'} · {Math.round(config.music.volume * 100)}%
                </div>
              ) : (
                <p className="px-3 text-[11px] leading-8 text-zinc-600">Music track</p>
              )}
            </div>
          </div>

          {showHistory && (
            <div className="card p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Render History
              </h2>
              {versions.length === 0 ? (
                <p className="text-sm text-zinc-500">No versions yet.</p>
              ) : (
                <ul className="divide-y divide-surface-800">
                  {versions.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">
                          Version {v.version_number}
                          {v.id === clip.current_version_id && (
                            <span className="ml-2 text-xs text-emerald-400">CURRENT ✓</span>
                          )}
                        </span>
                        <StatusBadge status={v.status} />
                      </div>
                      <div className="flex gap-1">
                        {v.render_url && (
                          <a
                            href={v.render_url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-ghost !py-1 text-xs"
                          >
                            Preview
                          </a>
                        )}
                        {v.id !== clip.current_version_id && v.render_url && (
                          <button
                            onClick={() => void restoreVersion(clip, v).then(load)}
                            className="btn-secondary !py-1 text-xs"
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: properties */}
        <div className="card flex flex-col overflow-hidden">
          <div className="flex border-b border-surface-700">
            {(
              [
                ['video', VideoIcon, 'Video'],
                ['captions', Type, 'Captions'],
                ['broll', Film, 'B-roll'],
                ['music', Music, 'Music'],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={classNames(
                  'flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-medium',
                  tab === key
                    ? 'border-b-2 border-brand-500 text-brand-400'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {tab === 'video' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Start (s)</label>
                    <input
                      type="number"
                      step={0.1}
                      className="input"
                      value={config.startTime}
                      onChange={(e) => update({ startTime: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="label">End (s)</label>
                    <input
                      type="number"
                      step={0.1}
                      className="input"
                      value={config.endTime}
                      onChange={(e) => update({ endTime: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Crop Mode</label>
                  <select
                    className="input"
                    value={config.crop.mode}
                    onChange={(e) =>
                      update({
                        crop: { ...config.crop, mode: e.target.value as 'smart' | 'center' | 'manual' },
                      })
                    }
                  >
                    <option value="smart">Smart (subject detection)</option>
                    <option value="center">Center</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                {config.crop.mode === 'manual' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Position X (0–1)</label>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        className="input"
                        value={config.crop.x}
                        onChange={(e) =>
                          update({ crop: { ...config.crop, x: Number(e.target.value) } })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Position Y (0–1)</label>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        className="input"
                        value={config.crop.y}
                        onChange={(e) =>
                          update({ crop: { ...config.crop, y: Number(e.target.value) } })
                        }
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Scale</label>
                    <input
                      type="number"
                      min={0.5}
                      max={3}
                      step={0.05}
                      className="input"
                      value={config.crop.scale}
                      onChange={(e) =>
                        update({ crop: { ...config.crop, scale: Number(e.target.value) } })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Speed</label>
                    <input
                      type="number"
                      min={0.5}
                      max={2}
                      step={0.05}
                      className="input"
                      value={config.speed}
                      onChange={(e) => update({ speed: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Resolution</label>
                  <select
                    className="input"
                    value={config.resolution.width}
                    onChange={(e) =>
                      update({
                        resolution:
                          e.target.value === '1080'
                            ? { width: 1080, height: 1920 }
                            : { width: 720, height: 1280 },
                      })
                    }
                  >
                    <option value="1080">1080 × 1920</option>
                    <option value="720">720 × 1280</option>
                  </select>
                </div>
              </>
            )}

            {tab === 'captions' && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={config.captions.enabled}
                    onChange={(e) =>
                      update({ captions: { ...config.captions, enabled: e.target.checked } })
                    }
                    className="h-4 w-4 accent-brand-500"
                  />
                  Captions enabled
                </label>
                <div>
                  <label className="label">Style Preset</label>
                  <select
                    className="input"
                    value={config.captions.style.preset}
                    onChange={(e) =>
                      updateStyle({ preset: e.target.value as CaptionStyle['preset'] })
                    }
                  >
                    <option value="bold">Bold</option>
                    <option value="minimal">Minimal</option>
                    <option value="kinetic">Kinetic</option>
                    <option value="creator">Creator</option>
                    <option value="high-impact">High Impact</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Font</label>
                    <select
                      className="input"
                      value={config.captions.style.font}
                      onChange={(e) => updateStyle({ font: e.target.value })}
                    >
                      <option>Inter</option>
                      <option>Montserrat</option>
                      <option>Bebas Neue</option>
                      <option>Poppins</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Font Size</label>
                    <input
                      type="number"
                      className="input"
                      value={config.captions.style.fontSize}
                      onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="label">Weight</label>
                    <select
                      className="input"
                      value={config.captions.style.weight}
                      onChange={(e) => updateStyle({ weight: Number(e.target.value) })}
                    >
                      <option value={400}>Regular</option>
                      <option value={600}>Semibold</option>
                      <option value={800}>Extrabold</option>
                      <option value={900}>Black</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Position</label>
                    <select
                      className="input"
                      value={config.captions.style.position}
                      onChange={(e) =>
                        updateStyle({ position: e.target.value as CaptionStyle['position'] })
                      }
                    >
                      <option value="top">Top</option>
                      <option value="center">Center</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Animation</label>
                    <select
                      className="input"
                      value={config.captions.style.animation}
                      onChange={(e) =>
                        updateStyle({ animation: e.target.value as CaptionStyle['animation'] })
                      }
                    >
                      <option value="none">None</option>
                      <option value="pop">Pop</option>
                      <option value="karaoke">Karaoke</option>
                      <option value="slide">Slide</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Alignment</label>
                    <select
                      className="input"
                      value={config.captions.style.alignment}
                      onChange={(e) =>
                        updateStyle({ alignment: e.target.value as CaptionStyle['alignment'] })
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Text Color</label>
                    <input
                      type="color"
                      className="input h-9"
                      value={config.captions.style.textColor}
                      onChange={(e) => updateStyle({ textColor: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Highlight Color</label>
                    <input
                      type="color"
                      className="input h-9"
                      value={config.captions.style.highlightColor}
                      onChange={(e) => updateStyle({ highlightColor: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Stroke Width</label>
                    <input
                      type="number"
                      min={0}
                      className="input"
                      value={config.captions.style.strokeWidth}
                      onChange={(e) => updateStyle({ strokeWidth: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="label">Line Spacing</label>
                    <input
                      type="number"
                      step={0.1}
                      min={1}
                      className="input"
                      value={config.captions.style.lineSpacing}
                      onChange={(e) => updateStyle({ lineSpacing: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </>
            )}

            {tab === 'broll' && (
              <>
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="Search stock B-roll…"
                    value={brollQuery}
                    onChange={(e) => setBrollQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void searchBroll()}
                  />
                  <button
                    onClick={() => void searchBroll()}
                    disabled={brollSearching}
                    className="btn-secondary !px-3"
                  >
                    {brollSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {brollError && (
                  <div className="text-xs text-red-400">
                    {brollError}{' '}
                    <button onClick={() => void searchBroll()} className="underline">
                      Retry
                    </button>
                  </div>
                )}
                {brollResults.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {brollResults.map((r) => (
                      <button
                        key={`${r.provider}-${r.externalId}`}
                        onClick={() =>
                          update({
                            broll: [
                              ...config.broll,
                              {
                                videoUrl: r.videoUrl,
                                startAt: 0,
                                duration: 3,
                                provider: r.provider,
                                query: brollQuery,
                              },
                            ],
                          })
                        }
                        className="group relative aspect-video overflow-hidden rounded-lg bg-surface-850"
                      >
                        {r.previewImageUrl && (
                          <img
                            src={r.previewImageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] uppercase">
                          {r.provider}
                        </span>
                        <span className="absolute inset-0 hidden items-center justify-center bg-black/50 text-xs font-medium group-hover:flex">
                          Add
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div>
                  <h3 className="label">B-roll in this clip</h3>
                  {config.broll.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      No B-roll yet. The AI adds B-roll automatically when enabled, or search above.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {config.broll.map((b: BrollConfigItem, i: number) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 rounded-lg border border-surface-700 p-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{b.query ?? 'B-roll'}</p>
                            <p className="text-[11px] text-zinc-500">{b.provider}</p>
                          </div>
                          <input
                            type="number"
                            step={0.5}
                            min={0}
                            title="Position (s)"
                            className="input !w-16 !px-2 !py-1 text-xs"
                            value={b.startAt}
                            onChange={(e) => {
                              const broll = [...config.broll]
                              broll[i] = { ...b, startAt: Number(e.target.value) }
                              update({ broll })
                            }}
                          />
                          <input
                            type="number"
                            step={0.5}
                            min={0.5}
                            title="Duration (s)"
                            className="input !w-16 !px-2 !py-1 text-xs"
                            value={b.duration}
                            onChange={(e) => {
                              const broll = [...config.broll]
                              broll[i] = { ...b, duration: Number(e.target.value) }
                              update({ broll })
                            }}
                          />
                          <button
                            onClick={() =>
                              update({ broll: config.broll.filter((_, j) => j !== i) })
                            }
                            className="btn-ghost !px-1.5 text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            {tab === 'music' && (
              <>
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="Search Jamendo music…"
                    value={musicQuery}
                    onChange={(e) => setMusicQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void searchMusic()}
                  />
                  <button
                    onClick={() => void searchMusic()}
                    disabled={musicSearching}
                    className="btn-secondary !px-3"
                  >
                    {musicSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {musicError && (
                  <div className="text-xs text-red-400">
                    {musicError}{' '}
                    <button onClick={() => void searchMusic()} className="underline">
                      Retry
                    </button>
                  </div>
                )}
                {musicResults.length > 0 && (
                  <ul className="space-y-2">
                    {musicResults.map((m) => (
                      <li
                        key={m.externalId}
                        className="flex items-center gap-2 rounded-lg border border-surface-700 p-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{m.title}</p>
                          <p className="truncate text-[11px] text-zinc-500">{m.artist}</p>
                        </div>
                        <audio src={m.audioUrl} controls className="h-8 w-28" />
                        <button
                          onClick={() =>
                            update({
                              music: {
                                audioUrl: m.audioUrl,
                                volume: 0.12,
                                fadeIn: 1,
                                fadeOut: 1,
                                trimStart: 0,
                                title: m.title,
                              },
                            })
                          }
                          className="btn-secondary !py-1 text-xs"
                        >
                          Use
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {config.music ? (
                  <div className="space-y-3 rounded-lg border border-surface-700 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">♪ {config.music.title ?? 'Track'}</p>
                      <button
                        onClick={() => update({ music: null })}
                        className="btn-ghost !px-1.5 text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div>
                      <label className="label">
                        Music Volume ({Math.round(config.music.volume * 100)}%)
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={0.4}
                        step={0.01}
                        value={config.music.volume}
                        onChange={(e) =>
                          update({ music: { ...config.music!, volume: Number(e.target.value) } })
                        }
                        className="w-full accent-brand-500"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="label">Fade In (s)</label>
                        <input
                          type="number"
                          step={0.5}
                          min={0}
                          className="input"
                          value={config.music.fadeIn}
                          onChange={(e) =>
                            update({ music: { ...config.music!, fadeIn: Number(e.target.value) } })
                          }
                        />
                      </div>
                      <div>
                        <label className="label">Fade Out (s)</label>
                        <input
                          type="number"
                          step={0.5}
                          min={0}
                          className="input"
                          value={config.music.fadeOut}
                          onChange={(e) =>
                            update({ music: { ...config.music!, fadeOut: Number(e.target.value) } })
                          }
                        />
                      </div>
                      <div>
                        <label className="label">Trim Start (s)</label>
                        <input
                          type="number"
                          step={0.5}
                          min={0}
                          className="input"
                          value={config.music.trimStart}
                          onChange={(e) =>
                            update({
                              music: { ...config.music!, trimStart: Number(e.target.value) },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    No music selected. Voice stays at 100%, music defaults to 12% so it never
                    overpowers speech.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
