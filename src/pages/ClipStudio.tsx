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
  Wand2,
  Key,
  Plus,
  Check,
  FileText,
  Layers,
  CheckCircle2,
  Play,
} from 'lucide-react'
import { supabase, invokeFunction } from '@/lib/supabase'
import type {
  BrollConfigItem,
  CaptionStyle,
  CaptionWordConfig,
  Clip,
  ClipConfiguration,
  ClipVersion,
  RenderJob,
} from '@/lib/types'
import { defaultClipConfiguration } from '@/lib/types'
import { saveConfigurationAsVersion, createRenderJob } from '@/lib/render'
import { classNames, formatDuration, formatTimestamp } from '@/lib/format'
import { LoadingState, ProgressBar } from '@/components/ui'
import { RemotionPlayerPreview } from '@/components/remotion/RemotionPlayerPreview'
import {
  generateWhisperCaptions,
  autoGenerateBrollWithAi,
  STOCK_BROLL_CATALOG,
  parseWhisperJson,
  type StockVideoAsset,
} from '@/lib/clipAiAssistant'

type Tab = 'video' | 'captions' | 'broll' | 'music'
type CaptionsSubTab = 'presets' | 'words' | 'whisper'

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

const PRESET_STYLES: Array<{
  name: string
  desc: string
  style: Partial<CaptionStyle>
}> = [
  {
    name: 'Karaoke Glow',
    desc: 'TikTok / Alex Hormozi active neon highlight',
    style: {
      preset: 'bold',
      font: 'Inter',
      fontSize: 54,
      weight: 900,
      textColor: '#FFFFFF',
      highlightColor: '#FACC15',
      strokeWidth: 4,
      strokeColor: '#000000',
      animation: 'karaoke',
      position: 'bottom',
      alignment: 'center',
    },
  },
  {
    name: 'MrBeast Pop',
    desc: 'Kinetic bouncy pop with heavy black outline',
    style: {
      preset: 'kinetic',
      font: 'Bebas Neue',
      fontSize: 58,
      weight: 900,
      textColor: '#FFFFFF',
      highlightColor: '#22C55E',
      strokeWidth: 6,
      strokeColor: '#000000',
      animation: 'pop',
      position: 'center',
      alignment: 'center',
    },
  },
  {
    name: 'Cyber Cyan',
    desc: 'High-contrast futuristic electric cyan',
    style: {
      preset: 'creator',
      font: 'Montserrat',
      fontSize: 52,
      weight: 800,
      textColor: '#FFFFFF',
      highlightColor: '#00F2FE',
      strokeWidth: 4,
      strokeColor: '#000000',
      animation: 'pop',
      position: 'bottom',
      alignment: 'center',
    },
  },
  {
    name: 'High Impact',
    desc: 'Uppercase bold white on black backdrop',
    style: {
      preset: 'high-impact',
      font: 'Inter',
      fontSize: 50,
      weight: 900,
      textColor: '#FFFFFF',
      highlightColor: '#FF4757',
      strokeWidth: 2,
      strokeColor: '#000000',
      animation: 'slide',
      position: 'bottom',
      alignment: 'center',
    },
  },
  {
    name: 'Minimal Sub',
    desc: 'Clean subtle subtitles for aesthetic reels',
    style: {
      preset: 'minimal',
      font: 'Inter',
      fontSize: 40,
      weight: 600,
      textColor: '#F3F4F6',
      highlightColor: '#FFFFFF',
      strokeWidth: 0,
      animation: 'none',
      position: 'bottom',
      alignment: 'center',
    },
  },
]

export default function ClipStudio() {
  const { clipId } = useParams<{ clipId: string }>()
  const [clip, setClip] = useState<Clip | null>(null)
  const [config, setConfig] = useState<ClipConfiguration | null>(null)
  const [versions, setVersions] = useState<ClipVersion[]>([])
  const [activeJob, setActiveJob] = useState<RenderJob | null>(null)
  const [tab, setTab] = useState<Tab>('captions')
  const [captionsSubTab, setCaptionsSubTab] = useState<CaptionsSubTab>('presets')
  const [saving, setSaving] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  // AI Captions & Whisper State
  const [openAiKey, setOpenAiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('clipforge_openai_key') || ''
    } catch {
      return ''
    }
  })
  const [generatingCaptions, setGeneratingCaptions] = useState(false)
  const [generatingBroll, setGeneratingBroll] = useState(false)
  const [magicPolishing, setMagicPolishing] = useState(false)
  const [whisperJsonInput, setWhisperJsonInput] = useState('')
  const [whisperKeySavedNotice, setWhisperKeySavedNotice] = useState(false)
  const [activeNotification, setActiveNotification] = useState<string | null>(null)

  // Stock B-Roll state
  const [selectedStockCategory, setSelectedStockCategory] = useState<string>('all')
  const [brollQuery, setBrollQuery] = useState('')
  const [brollResults, setBrollResults] = useState<BrollSearchResult[]>([])
  const [brollSearching, setBrollSearching] = useState(false)
  const [brollError, setBrollError] = useState<string | null>(null)

  // Music state
  const [musicQuery, setMusicQuery] = useState('')
  const [musicResults, setMusicResults] = useState<MusicSearchResult[]>([])
  const [musicSearching, setMusicSearching] = useState(false)
  const [musicError, setMusicError] = useState<string | null>(null)

  const [previewMode, setPreviewMode] = useState<'live' | 'rendered'>('live')

  const showNotification = (msg: string) => {
    setActiveNotification(msg)
    setTimeout(() => setActiveNotification(null), 4000)
  }

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
        return defaultClipConfiguration(
          loadedClip.current_thumbnail_url || '',
          loadedClip.start_time,
          loadedClip.end_time,
        )
      return prev
    })
  }, [clipId])

  useEffect(() => {
    void load()
  }, [load])

  // Poll while a render job is active
  useEffect(() => {
    if (!activeJob) return
    const interval = setInterval(() => void load(), 3000)
    return () => clearInterval(interval)
  }, [activeJob, load])

  const currentVersion = useMemo(
    () => versions.find((v) => v.id === clip?.current_version_id) ?? null,
    [versions, clip],
  )

  const update = useCallback((patch: Partial<ClipConfiguration>) => {
    setConfig((c) => (c ? { ...c, ...patch } : null))
  }, [])

  const updateStyle = useCallback(
    (patch: Partial<CaptionStyle>) => {
      if (!config) return
      update({
        captions: {
          ...config.captions,
          style: { ...config.captions.style, ...patch },
        },
      })
    },
    [config, update],
  )

  async function handleSave(): Promise<ClipVersion | null> {
    if (!clip || !config) return null
    setSaving(true)
    setError(null)
    try {
      const version = await saveConfigurationAsVersion(clip, config)
      await load()
      showNotification('Configuration saved successfully.')
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
      await invokeFunction('start-render', { renderJobId: job.id }).catch(() => {})
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start render.')
    } finally {
      setRendering(false)
    }
  }

  const handleSaveOpenAiKey = (key: string) => {
    setOpenAiKey(key)
    try {
      if (key.trim()) {
        localStorage.setItem('clipforge_openai_key', key.trim())
      } else {
        localStorage.removeItem('clipforge_openai_key')
      }
      setWhisperKeySavedNotice(true)
      setTimeout(() => setWhisperKeySavedNotice(false), 2500)
    } catch (e) {
      console.warn('Storage error:', e)
    }
  }

  // Generate captions using OpenAI Whisper or AI Timing Engine
  async function handleGenerateCaptions() {
    if (!clip || !config) return
    setGeneratingCaptions(true)
    setError(null)
    try {
      const words = await generateWhisperCaptions({
        clip,
        customApiKey: openAiKey,
      })

      if (words.length > 0) {
        update({
          captions: {
            ...config.captions,
            enabled: true,
            words,
          },
        })
        setCaptionsSubTab('words')
        showNotification(`Generated ${words.length} synchronized caption words!`)
      } else {
        setError('No words could be transcribed. Please check input.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Caption generation failed.')
    } finally {
      setGeneratingCaptions(false)
    }
  }

  // Auto B-Roll with AI Analysis
  async function handleAutoBroll() {
    if (!clip || !config) return
    setGeneratingBroll(true)
    setError(null)
    try {
      const brollItems = await autoGenerateBrollWithAi({
        clip,
        customApiKey: openAiKey,
      })

      if (brollItems.length > 0) {
        update({
          broll: brollItems,
        })
        setTab('broll')
        showNotification(`Auto B-Roll added ${brollItems.length} contextual scenes based on AI analysis!`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto B-roll generation failed.')
    } finally {
      setGeneratingBroll(false)
    }
  }

  // Magic AI Polish: Runs Captions + B-Roll simultaneously
  async function handleMagicAiPolish() {
    if (!clip || !config) return
    setMagicPolishing(true)
    setError(null)
    try {
      const [words, brollItems] = await Promise.all([
        generateWhisperCaptions({ clip, customApiKey: openAiKey }),
        autoGenerateBrollWithAi({ clip, customApiKey: openAiKey }),
      ])

      update({
        captions: {
          ...config.captions,
          enabled: true,
          words: words.length > 0 ? words : config.captions.words,
        },
        broll: brollItems.length > 0 ? brollItems : config.broll,
      })

      showNotification('Magic Polish applied: Synced AI Captions & Auto B-Roll added!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Magic Polish failed.')
    } finally {
      setMagicPolishing(false)
    }
  }

  // Import raw Whisper JSON
  function handleImportWhisperJson() {
    if (!whisperJsonInput.trim() || !config) return
    const words = parseWhisperJson(whisperJsonInput)
    if (words.length > 0) {
      update({
        captions: {
          ...config.captions,
          enabled: true,
          words,
        },
      })
      setCaptionsSubTab('words')
      setWhisperJsonInput('')
      showNotification(`Imported ${words.length} words from Whisper JSON!`)
    } else {
      setError('Could not find word timestamps in pasted JSON. Ensure it is Whisper verbose_json format.')
    }
  }

  // Direct Word Timing Edits
  function handleUpdateWord(index: number, field: keyof CaptionWordConfig, value: any) {
    if (!config) return
    const words = [...config.captions.words]
    words[index] = {
      ...words[index],
      [field]: field === 'text' ? String(value) : Number(value),
    }
    update({
      captions: {
        ...config.captions,
        words,
      },
    })
  }

  function handleAddWord() {
    if (!config) return
    const words = [...config.captions.words]
    const lastWord = words[words.length - 1]
    const start = lastWord ? Number((lastWord.end + 0.05).toFixed(2)) : 0
    const end = Number((start + 0.35).toFixed(2))
    words.push({ text: 'New', start, end })
    update({
      captions: {
        ...config.captions,
        words,
      },
    })
  }

  function handleDeleteWord(index: number) {
    if (!config) return
    const words = config.captions.words.filter((_, i) => i !== index)
    update({
      captions: {
        ...config.captions,
        words,
      },
    })
  }

  // Stock B-Roll Catalog Insert
  function handleAddStockBroll(asset: StockVideoAsset) {
    if (!config || !clip) return
    const clipDuration = clip.duration || clip.end_time - clip.start_time || 30
    const startAt = config.broll.length > 0 ? Math.min(clipDuration - 3, config.broll[config.broll.length - 1].startAt + 5) : 1.0

    const newItem: BrollConfigItem = {
      videoUrl: asset.videoUrl,
      startAt: Math.max(0, Number(startAt.toFixed(1))),
      duration: 3.5,
      provider: 'stock',
      query: asset.title,
    }

    update({
      broll: [...config.broll, newItem],
    })
    showNotification(`Added "${asset.title}" B-Roll overlay!`)
  }

  // Search stock B-Roll via Edge Function
  async function searchBroll() {
    if (!brollQuery.trim()) return
    setBrollSearching(true)
    setBrollError(null)
    try {
      const data = await invokeFunction<{ results: BrollSearchResult[] }>('broll-search', {
        query: brollQuery,
      })
      setBrollResults(data.results ?? [])
      if (!data.results || data.results.length === 0) {
        setBrollError('No stock videos found. Try "tech", "coding", "finance", or use the Curated Catalog below.')
      }
    } catch (err) {
      setBrollError('Stock API search error. You can choose any clip from the Curated Stock Library below.')
    } finally {
      setBrollSearching(false)
    }
  }

  // Search Jamendo music
  async function searchMusic() {
    if (!musicQuery.trim()) return
    setMusicSearching(true)
    setMusicError(null)
    try {
      const data = await invokeFunction<{ results: MusicSearchResult[] }>('music-search', {
        query: musicQuery,
      })
      setMusicResults(data.results ?? [])
    } catch (err) {
      setMusicError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setMusicSearching(false)
    }
  }

  if (!clip || !config) return <LoadingState />

  const filteredStockCatalog = selectedStockCategory === 'all'
    ? STOCK_BROLL_CATALOG
    : STOCK_BROLL_CATALOG.filter((s) => s.category === selectedStockCategory)

  return (
    <div className="flex h-full flex-col">
      {/* Top Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={`/projects/${clip.project_id}`} className="btn-ghost !px-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">{clip.title}</h1>
              <span className="rounded bg-brand-500/20 px-2 py-0.5 text-xs font-semibold text-brand-400 border border-brand-500/30">
                Remotion Studio
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              {formatDuration(clip.duration)} · Pattern: {clip.matched_pattern_name ?? 'Viral Hook'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Magic AI Polish Button */}
          <button
            onClick={() => void handleMagicAiPolish()}
            disabled={magicPolishing || generatingCaptions || generatingBroll}
            className="btn-primary !bg-gradient-to-r !from-indigo-500 !via-purple-500 !to-pink-500 hover:opacity-95 shadow-lg shadow-purple-500/20"
            title="Auto-generate word-by-word synced captions and contextual B-roll with AI"
          >
            {magicPolishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            <span>Magic AI Polish</span>
          </button>

          <button onClick={() => setShowHistory(!showHistory)} className="btn-secondary">
            <History className="h-4 w-4" /> Versions ({versions.length})
          </button>
          <button onClick={() => void handleSave()} disabled={saving} className="btn-secondary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
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
            Render MP4
          </button>
        </div>
      </div>

      {/* Notifications / Errors */}
      {activeNotification && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{activeNotification}</span>
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-300">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
            ×
          </button>
        </div>
      )}

      {activeJob && (
        <div className="card mb-4 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-brand-400">
              {activeJob.stage ?? 'Rendering with Remotion engine…'}
            </span>
            <span className="tabular-nums text-zinc-400">{Math.round(activeJob.progress)}%</span>
          </div>
          <ProgressBar value={activeJob.progress} />
        </div>
      )}

      {/* Main Studio Grid */}
      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(260px,320px)_1fr_minmax(320px,420px)]">
        {/* LEFT: Live Remotion vertical player */}
        <div className="card flex flex-col items-center justify-between p-4 bg-surface-900 border-surface-800">
          <div className="mb-3 flex w-full items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              <Sparkles className="h-3.5 w-3.5 text-brand-400" />
              <span>Remotion Preview</span>
            </div>

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

        {/* CENTER: Timeline & Quick Controls */}
        <div className="flex flex-col gap-4">
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Clip Timeline
              </h2>
              <span className="text-xs text-zinc-400 font-mono">
                {formatTimestamp(config.startTime)} → {formatTimestamp(config.endTime)} ({formatDuration(config.endTime - config.startTime)})
              </span>
            </div>

            <div className="relative h-14 rounded-lg bg-surface-850 border border-surface-700/60 overflow-hidden">
              <div className="absolute inset-y-1.5 left-2 right-2 rounded bg-brand-500/20 border border-brand-500/40 flex items-center justify-between px-3">
                <span className="text-xs font-medium text-brand-300 flex items-center gap-1">
                  <Play className="h-3 w-3 fill-brand-300" /> Start: {formatTimestamp(config.startTime)}
                </span>
                <span className="text-xs font-medium text-brand-300">
                  End: {formatTimestamp(config.endTime)}
                </span>
              </div>
            </div>

            {/* B-Roll Tracks Indicator on Timeline */}
            {config.broll.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3 w-3 text-purple-400" /> Active B-Roll Layers ({config.broll.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {config.broll.map((b, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 text-[11px] text-purple-300"
                    >
                      <Film className="h-2.5 w-2.5" />
                      {b.query || `B-Roll #${i + 1}`} ({b.startAt.toFixed(1)}s - {(b.startAt + b.duration).toFixed(1)}s)
                      <button
                        onClick={() => update({ broll: config.broll.filter((_, j) => j !== i) })}
                        className="ml-1 text-purple-300/60 hover:text-purple-100"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Captions summary on timeline */}
            {config.captions.enabled && (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-850 p-2.5 text-xs text-zinc-300">
                <div className="flex items-center gap-2">
                  <Type className="h-4 w-4 text-brand-400" />
                  <span>
                    <strong>{config.captions.words.length} synced words</strong> ·{' '}
                    <span className="text-zinc-400">Style: {config.captions.style.preset} ({config.captions.style.animation})</span>
                  </span>
                </div>
                <button
                  onClick={() => {
                    setTab('captions')
                    setCaptionsSubTab('words')
                  }}
                  className="text-brand-400 hover:underline"
                >
                  Edit Words
                </button>
              </div>
            )}
          </div>

          {/* Quick AI Action Cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card p-4 bg-gradient-to-br from-surface-900 to-surface-850 border-surface-700">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 text-brand-400">
                    <Type className="h-4 w-4" /> AI Captions (Whisper)
                  </h3>
                  <p className="mt-1 text-xs text-zinc-400">
                    Word-by-word synced viral captions with karaoke highlighting.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => void handleGenerateCaptions()}
                  disabled={generatingCaptions}
                  className="btn-secondary !py-1.5 !px-3 text-xs w-full justify-center"
                >
                  {generatingCaptions ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                  )}
                  {config.captions.words.length > 0 ? 'Regenerate Captions' : 'Generate Captions'}
                </button>
              </div>
            </div>

            <div className="card p-4 bg-gradient-to-br from-surface-900 to-surface-850 border-surface-700">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 text-purple-400">
                    <Layers className="h-4 w-4" /> Auto B-Roll (AI Analysis)
                  </h3>
                  <p className="mt-1 text-xs text-zinc-400">
                    AI analyzes hook and topic to drop in relevant stock footage.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => void handleAutoBroll()}
                  disabled={generatingBroll}
                  className="btn-secondary !py-1.5 !px-3 text-xs w-full justify-center"
                >
                  {generatingBroll ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5 text-purple-400" />
                  )}
                  Auto-Add B-Roll
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Main Inspector Tabs */}
        <div className="card flex flex-col p-4 bg-surface-900 border-surface-800">
          <div className="mb-4 flex border-b border-surface-700 pb-2">
            {(
              [
                { id: 'captions', label: 'Captions', icon: Type },
                { id: 'broll', label: 'B-Roll', icon: Film },
                { id: 'video', label: 'Video', icon: VideoIcon },
                { id: 'music', label: 'Music', icon: Music },
              ] as const
            ).map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={classNames(
                    'flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs font-semibold transition-colors',
                    active
                      ? 'border-brand-500 text-brand-400'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              )
            })}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
            {/* CAPTIONS TAB */}
            {tab === 'captions' && (
              <div className="space-y-4">
                {/* Master toggle */}
                <div className="flex items-center justify-between rounded-lg bg-surface-850 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.captions.enabled}
                      onChange={(e) =>
                        update({ captions: { ...config.captions, enabled: e.target.checked } })
                      }
                      className="h-4 w-4 rounded accent-brand-500"
                    />
                    <span>Captions Enabled</span>
                  </label>

                  <button
                    onClick={() => void handleGenerateCaptions()}
                    disabled={generatingCaptions}
                    className="btn-primary !py-1 !px-2.5 text-xs"
                  >
                    {generatingCaptions ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Generate AI Captions
                  </button>
                </div>

                {/* Sub tabs: Style Presets vs Word-by-Word Timings vs Whisper API */}
                <div className="flex rounded-lg bg-surface-800 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setCaptionsSubTab('presets')}
                    className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                      captionsSubTab === 'presets' ? 'bg-surface-700 text-white' : 'text-zinc-400'
                    }`}
                  >
                    Style & Presets
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaptionsSubTab('words')}
                    className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                      captionsSubTab === 'words' ? 'bg-surface-700 text-white' : 'text-zinc-400'
                    }`}
                  >
                    Words ({config.captions.words?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaptionsSubTab('whisper')}
                    className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                      captionsSubTab === 'whisper' ? 'bg-surface-700 text-white' : 'text-zinc-400'
                    }`}
                  >
                    Whisper API
                  </button>
                </div>

                {/* PRESETS SUBTAB */}
                {captionsSubTab === 'presets' && (
                  <div className="space-y-4">
                    <div>
                      <label className="label">1-Click Viral Style Presets</label>
                      <div className="grid grid-cols-1 gap-2">
                        {PRESET_STYLES.map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => updateStyle(p.style)}
                            className="flex items-center justify-between rounded-lg border border-surface-700 bg-surface-850 p-2.5 text-left transition-all hover:border-brand-500/50 hover:bg-surface-800"
                          >
                            <div>
                              <p className="text-xs font-semibold text-zinc-200">{p.name}</p>
                              <p className="text-[11px] text-zinc-400">{p.desc}</p>
                            </div>
                            <span
                              className="rounded px-2 py-1 text-xs font-bold font-mono"
                              style={{
                                color: p.style.highlightColor,
                                backgroundColor: '#18181b',
                              }}
                            >
                              SAMPLE
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">Font Family</label>
                        <select
                          className="input text-xs"
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
                        <label className="label">Font Size ({config.captions.style.fontSize}px)</label>
                        <input
                          type="number"
                          min={24}
                          max={80}
                          className="input text-xs"
                          value={config.captions.style.fontSize}
                          onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="label">Animation</label>
                        <select
                          className="input text-xs"
                          value={config.captions.style.animation}
                          onChange={(e) =>
                            updateStyle({ animation: e.target.value as CaptionStyle['animation'] })
                          }
                        >
                          <option value="karaoke">Karaoke (Active Highlight)</option>
                          <option value="pop">Pop (Bouncy Word Scale)</option>
                          <option value="slide">Slide In</option>
                          <option value="none">Static Subtitle</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Screen Position</label>
                        <select
                          className="input text-xs"
                          value={config.captions.style.position}
                          onChange={(e) =>
                            updateStyle({ position: e.target.value as CaptionStyle['position'] })
                          }
                        >
                          <option value="bottom">Bottom (Classic)</option>
                          <option value="center">Center (High Impact)</option>
                          <option value="top">Top</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Active Highlight Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            className="h-8 w-12 cursor-pointer rounded border border-surface-700 bg-surface-800"
                            value={config.captions.style.highlightColor}
                            onChange={(e) => updateStyle({ highlightColor: e.target.value })}
                          />
                          <span className="text-xs font-mono text-zinc-400">
                            {config.captions.style.highlightColor}
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className="label">Default Text Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            className="h-8 w-12 cursor-pointer rounded border border-surface-700 bg-surface-800"
                            value={config.captions.style.textColor}
                            onChange={(e) => updateStyle({ textColor: e.target.value })}
                          />
                          <span className="text-xs font-mono text-zinc-400">
                            {config.captions.style.textColor}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* WORD TIMINGS SUBTAB */}
                {captionsSubTab === 'words' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">
                        {config.captions.words?.length || 0} word timings synced to Remotion player
                      </span>
                      <button onClick={handleAddWord} className="btn-secondary !py-1 !px-2 text-xs">
                        <Plus className="h-3.5 w-3.5" /> Add Word
                      </button>
                    </div>

                    {(!config.captions.words || config.captions.words.length === 0) ? (
                      <div className="rounded-lg border border-dashed border-surface-700 p-6 text-center">
                        <Type className="mx-auto h-8 w-8 text-zinc-500" />
                        <p className="mt-2 text-xs text-zinc-400">No caption words generated yet.</p>
                        <button
                          onClick={() => void handleGenerateCaptions()}
                          disabled={generatingCaptions}
                          className="btn-primary mt-3 !py-1.5 text-xs mx-auto"
                        >
                          <Sparkles className="h-3.5 w-3.5" /> Generate with OpenAI Whisper
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                        {config.captions.words.map((word, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 rounded-md bg-surface-850 p-1.5 border border-surface-750 text-xs"
                          >
                            <span className="w-6 text-center text-[10px] text-zinc-500 font-mono">
                              #{idx + 1}
                            </span>
                            <input
                              type="text"
                              value={word.text}
                              onChange={(e) => handleUpdateWord(idx, 'text', e.target.value)}
                              className="input flex-1 !py-1 !px-2 font-semibold text-xs text-white"
                            />
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step={0.05}
                                min={0}
                                value={word.start}
                                onChange={(e) => handleUpdateWord(idx, 'start', e.target.value)}
                                title="Start timestamp in seconds"
                                className="input !w-14 !py-1 !px-1 text-center font-mono text-[11px]"
                              />
                              <span className="text-zinc-500">-</span>
                              <input
                                type="number"
                                step={0.05}
                                min={0}
                                value={word.end}
                                onChange={(e) => handleUpdateWord(idx, 'end', e.target.value)}
                                title="End timestamp in seconds"
                                className="input !w-14 !py-1 !px-1 text-center font-mono text-[11px]"
                              />
                            </div>
                            <button
                              onClick={() => handleDeleteWord(idx)}
                              className="text-zinc-500 hover:text-red-400 p-1"
                              title="Delete word"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* WHISPER API & IMPORT SUBTAB */}
                {captionsSubTab === 'whisper' && (
                  <div className="space-y-4">
                    {/* API Key Card */}
                    <div className="rounded-lg bg-surface-850 p-3 border border-surface-700 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                          <Key className="h-3.5 w-3.5 text-brand-400" /> OpenAI Whisper API Key
                        </label>
                        {whisperKeySavedNotice && (
                          <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                            <Check className="h-3 w-3" /> Saved
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        Enter your OpenAI API Key (sk-...) to transcribe audio files directly with Whisper-1 verbose_json word timings.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          placeholder="sk-..."
                          value={openAiKey}
                          onChange={(e) => handleSaveOpenAiKey(e.target.value)}
                          className="input flex-1 text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* Import Raw JSON */}
                    <div className="rounded-lg bg-surface-850 p-3 border border-surface-700 space-y-2">
                      <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-purple-400" /> Paste Raw Whisper JSON
                      </label>
                      <p className="text-[11px] text-zinc-400">
                        Paste Whisper transcript JSON containing word arrays or segment timestamps.
                      </p>
                      <textarea
                        rows={4}
                        placeholder='{"words": [{"word": "Hello", "start": 0.0, "end": 0.5}]}'
                        value={whisperJsonInput}
                        onChange={(e) => setWhisperJsonInput(e.target.value)}
                        className="input w-full font-mono text-[11px]"
                      />
                      <button
                        onClick={handleImportWhisperJson}
                        className="btn-secondary !py-1.5 text-xs w-full justify-center"
                      >
                        Parse & Load Timings
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* B-ROLL TAB */}
            {tab === 'broll' && (
              <div className="space-y-4">
                {/* Auto B-Roll banner */}
                <div className="rounded-lg bg-gradient-to-r from-purple-900/40 to-indigo-900/40 p-3 border border-purple-500/30">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                        <Wand2 className="h-3.5 w-3.5" /> AI Auto B-Roll Analyzer
                      </h4>
                      <p className="mt-1 text-[11px] text-zinc-300">
                        Analyzes retention moments in &ldquo;{clip.title}&rdquo; to place strategic stock scenes automatically.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => void handleAutoBroll()}
                    disabled={generatingBroll}
                    className="btn-primary mt-2.5 w-full !bg-purple-600 hover:!bg-purple-500 !py-1.5 text-xs justify-center"
                  >
                    {generatingBroll ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Auto-Generate B-Roll with AI
                  </button>
                </div>

                {/* Curated Royalty-Free Catalog */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="label !mb-0">Curated Stock Library</label>
                    <div className="flex gap-1 overflow-x-auto text-[10px]">
                      {(['all', 'tech', 'finance', 'reaction', 'lifestyle'] as const).map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setSelectedStockCategory(cat)}
                          className={`rounded px-2 py-0.5 capitalize transition-colors ${
                            selectedStockCategory === cat
                              ? 'bg-brand-500 text-white font-medium'
                              : 'bg-surface-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                    {filteredStockCatalog.map((asset) => (
                      <div
                        key={asset.id}
                        className="group relative aspect-video overflow-hidden rounded-lg bg-surface-850 border border-surface-700 cursor-pointer"
                        onClick={() => handleAddStockBroll(asset)}
                      >
                        <img
                          src={asset.thumbnailUrl}
                          alt={asset.title}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        <span className="absolute bottom-1 left-1.5 right-1.5 truncate text-[10px] font-medium text-zinc-200">
                          {asset.title}
                        </span>
                        <div className="absolute inset-0 hidden items-center justify-center bg-black/60 text-xs font-semibold text-white group-hover:flex">
                          + Add to Clip
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Search external stock */}
                <div>
                  <label className="label">Search External Stock Video</label>
                  <div className="flex gap-2">
                    <input
                      className="input text-xs"
                      placeholder="e.g. cyber matrix, money profit..."
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
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Search className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  {brollError && <p className="mt-1.5 text-xs text-amber-400">{brollError}</p>}
                  {brollResults.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {brollResults.map((r) => (
                        <div
                          key={`${r.provider}-${r.externalId}`}
                          className="group relative aspect-video overflow-hidden rounded-lg bg-surface-850 border border-surface-700 cursor-pointer"
                          onClick={() => {
                            update({
                              broll: [
                                ...config.broll,
                                {
                                  videoUrl: r.videoUrl,
                                  startAt: config.broll.length > 0 ? config.broll[config.broll.length - 1].startAt + 4 : 1,
                                  duration: 3.5,
                                  provider: r.provider,
                                  query: brollQuery,
                                },
                              ],
                            })
                            showNotification(`Added ${r.provider} B-Roll to clip!`)
                          }}
                        >
                          {r.previewImageUrl ? (
                            <img src={r.previewImageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center bg-surface-800 text-zinc-500">
                              <Film className="h-6 w-6" />
                            </div>
                          )}
                          <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[9px] uppercase text-zinc-300">
                            {r.provider}
                          </span>
                          <div className="absolute inset-0 hidden items-center justify-center bg-black/60 text-xs font-semibold text-white group-hover:flex">
                            + Add
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active B-Roll list */}
                <div>
                  <h3 className="label">Active B-Roll Layers in this Clip ({config.broll.length})</h3>
                  {config.broll.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      No B-roll segments yet. Click &ldquo;Auto-Generate B-Roll with AI&rdquo; or choose from the catalog above.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {config.broll.map((b: BrollConfigItem, i: number) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 rounded-lg border border-surface-700 bg-surface-850 p-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-zinc-200">
                              {b.query ?? `Scene #${i + 1}`}
                            </p>
                            <p className="text-[10px] text-zinc-500 uppercase">{b.provider || 'stock'}</p>
                          </div>
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-[10px] text-zinc-400">At:</span>
                            <input
                              type="number"
                              step={0.5}
                              min={0}
                              title="Start time offset in seconds"
                              className="input !w-14 !px-1 !py-0.5 text-xs font-mono"
                              value={b.startAt}
                              onChange={(e) => {
                                const broll = [...config.broll]
                                broll[i] = { ...b, startAt: Number(e.target.value) }
                                update({ broll })
                              }}
                            />
                            <span className="text-[10px] text-zinc-400">Dur:</span>
                            <input
                              type="number"
                              step={0.5}
                              min={0.5}
                              title="Duration in seconds"
                              className="input !w-14 !px-1 !py-0.5 text-xs font-mono"
                              value={b.duration}
                              onChange={(e) => {
                                const broll = [...config.broll]
                                broll[i] = { ...b, duration: Number(e.target.value) }
                                update({ broll })
                              }}
                            />
                          </div>
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
              </div>
            )}

            {/* VIDEO CROP & SPEED TAB */}
            {tab === 'video' && (
              <div className="space-y-4">
                <div>
                  <label className="label">Crop Framing Mode</label>
                  <select
                    className="input"
                    value={config.crop.mode}
                    onChange={(e) =>
                      update({
                        crop: {
                          ...config.crop,
                          mode: e.target.value as ClipConfiguration['crop']['mode'],
                        },
                      })
                    }
                  >
                    <option value="center">Center Framing (Default)</option>
                    <option value="face_track">Face Tracking</option>
                    <option value="custom">Manual Position</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Zoom Scale ({config.crop.scale}x)</label>
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
                    <label className="label">Playback Speed ({config.speed}x)</label>
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
              </div>
            )}

            {/* MUSIC TAB */}
            {tab === 'music' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="Search royalty-free music…"
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
                {musicError && <div className="text-xs text-red-400">{musicError}</div>}
                {musicResults.length > 0 && (
                  <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {musicResults.map((m) => (
                      <li
                        key={m.externalId}
                        className="flex items-center gap-2 rounded-lg border border-surface-700 p-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{m.title}</p>
                          <p className="truncate text-[11px] text-zinc-500">{m.artist}</p>
                        </div>
                        <audio src={m.audioUrl} controls className="h-7 w-24" />
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
                  <div className="space-y-3 rounded-lg border border-surface-700 p-3 bg-surface-850">
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
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    No background music track selected.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
