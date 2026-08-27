import { useEffect, useState, type DragEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Upload, Loader2, FileVideo, X } from 'lucide-react'
import { YoutubeIcon } from '@/components/icons'
import { supabase, invokeFunction } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { PatternSet, DurationPreset } from '@/lib/types'
import { formatFileSize, classNames } from '@/lib/format'
import { PageHeader, ProgressBar } from '@/components/ui'

const YOUTUBE_URL_RE =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]{11}/

const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

interface ProjectConfig {
  name: string
  patternSetId: string | null
  durationPreset: DurationPreset
  maxClips: number
  autoBroll: boolean
  autoMusic: boolean
  captionPreset: string
  aiOptimization: boolean
}

export default function CreateProject() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<'youtube' | 'upload'>(
    searchParams.get('tab') === 'upload' ? 'upload' : 'youtube',
  )
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [patternSets, setPatternSets] = useState<PatternSet[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [config, setConfig] = useState<ProjectConfig>({
    name: '',
    patternSetId: null,
    durationPreset: 'ai',
    maxClips: 10,
    autoBroll: true,
    autoMusic: true,
    captionPreset: 'bold',
    aiOptimization: true,
  })

  useEffect(() => {
    supabase
      .from('pattern_sets')
      .select('*')
      .order('created_at')
      .then(({ data }) => {
        const sets = (data as PatternSet[]) ?? []
        setPatternSets(sets)
        const active = sets.find((s) => s.is_active)
        if (active) setConfig((c) => ({ ...c, patternSetId: active.id }))
      })
  }, [])

  function handleFileSelected(f: File) {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setSubmitError('Unsupported format. Please upload MP4, MOV or WebM.')
      return
    }
    setSubmitError(null)
    setFile(f)
    if (!config.name) setConfig((c) => ({ ...c, name: f.name.replace(/\.[^.]+$/, '') }))
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFileSelected(f)
  }

  async function handleSubmit() {
    setSubmitError(null)

    if (tab === 'youtube') {
      if (!YOUTUBE_URL_RE.test(youtubeUrl.trim())) {
        setUrlError('Please enter a valid YouTube video URL.')
        return
      }
      setUrlError(null)
    } else if (!file) {
      setSubmitError('Select a video file to upload.')
      return
    }

    setSubmitting(true)
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          user_id: user!.id,
          name: config.name || (tab === 'youtube' ? 'YouTube Import' : file!.name),
          source_type: tab,
          source_url: tab === 'youtube' ? youtubeUrl.trim() : null,
          status: tab === 'upload' ? 'UPLOADING' : 'QUEUED',
          pattern_set_id: config.patternSetId,
          clip_duration_preset: config.durationPreset,
          max_clips: config.maxClips,
          auto_broll: config.autoBroll,
          auto_music: config.autoMusic,
          caption_preset: config.captionPreset,
          ai_optimization: config.aiOptimization,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)

      if (tab === 'upload' && file) {
        setUploadProgress(0)
        const path = `projects/${project.id}/source/${file.name}`
        const { error: uploadError } = await supabase.storage
          .from('sources')
          .upload(path, file, { upsert: true })
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)
        setUploadProgress(100)

        await supabase.from('videos').insert({
          project_id: project.id,
          title: config.name || file.name,
          file_size: file.size,
          storage_path: path,
        })
        await supabase.from('projects').update({ status: 'QUEUED' }).eq('id', project.id)
      }

      // Hand off to the real backend: the edge function marks the project QUEUED
      // and the pipeline worker (renderer/pipeline.ts) picks it up and does the
      // actual download/transcribe/analyze/render work, writing real status and
      // progress updates back to the project row as it goes. We don't fake any
      // of that client-side — the project detail page polls the real values.
      try {
        await invokeFunction('process-video', { projectId: project.id })
      } catch (e) {
        console.warn('process-video function call failed, project remains queued for the worker:', e)
      }

      navigate(`/projects/${project.id}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create project.')
      setSubmitting(false)
      setUploadProgress(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Create Project"
        subtitle="Turn a long-form video into high-performing Shorts"
      />

      <div className="mb-5 flex gap-2">
        <button
          onClick={() => setTab('youtube')}
          className={classNames(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
            tab === 'youtube' ? 'bg-brand-500 text-white' : 'bg-surface-800 text-zinc-400',
          )}
        >
          <YoutubeIcon className="h-4 w-4" /> YouTube URL
        </button>
        <button
          onClick={() => setTab('upload')}
          className={classNames(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
            tab === 'upload' ? 'bg-brand-500 text-white' : 'bg-surface-800 text-zinc-400',
          )}
        >
          <Upload className="h-4 w-4" /> Upload Video
        </button>
      </div>

      <div className="card mb-5 p-6">
        {tab === 'youtube' ? (
          <div>
            <label className="label">Paste YouTube URL</label>
            <input
              className="input"
              placeholder="https://www.youtube.com/watch?v=…"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
            />
            {urlError && <p className="mt-2 text-sm text-red-400">{urlError}</p>}
            <p className="mt-2 text-xs text-zinc-500">
              We&apos;ll fetch the video metadata, thumbnail, title and duration, then download and
              process the source video securely.
            </p>
          </div>
        ) : file ? (
          <div className="flex items-center gap-4">
            <FileVideo className="h-10 w-10 text-brand-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{file.name}</p>
              <p className="text-sm text-zinc-500">{formatFileSize(file.size)}</p>
              {uploadProgress != null && <ProgressBar value={uploadProgress} className="mt-2" />}
            </div>
            <button onClick={() => setFile(null)} className="btn-ghost !px-2">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={classNames(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors',
              dragOver ? 'border-brand-500 bg-brand-500/5' : 'border-surface-600',
            )}
          >
            <Upload className="h-8 w-8 text-zinc-500" />
            <div>
              <p className="font-medium">Drag &amp; drop your video here</p>
              <p className="mt-1 text-xs text-zinc-500">MP4, MOV or WebM — or click to browse</p>
            </div>
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFileSelected(f)
              }}
            />
          </label>
        )}
      </div>

      <div className="card mb-5 space-y-4 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Clip Configuration
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Project Name</label>
            <input
              className="input"
              placeholder="My podcast episode"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Pattern Set</label>
            <select
              className="input"
              value={config.patternSetId ?? ''}
              onChange={(e) => setConfig({ ...config, patternSetId: e.target.value || null })}
            >
              <option value="">No pattern set</option>
              {patternSets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.is_active ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Clip Duration</label>
            <select
              className="input"
              value={config.durationPreset}
              onChange={(e) =>
                setConfig({ ...config, durationPreset: e.target.value as DurationPreset })
              }
            >
              <option value="15-30">15–30 seconds</option>
              <option value="30-60">30–60 seconds</option>
              <option value="60-90">60–90 seconds</option>
              <option value="ai">AI Optimized</option>
            </select>
          </div>
          <div>
            <label className="label">Number of Clips</label>
            <input
              type="number"
              min={1}
              max={30}
              className="input"
              value={config.maxClips}
              onChange={(e) => setConfig({ ...config, maxClips: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Caption Preset</label>
            <select
              className="input"
              value={config.captionPreset}
              onChange={(e) => setConfig({ ...config, captionPreset: e.target.value })}
            >
              <option value="bold">Bold</option>
              <option value="minimal">Minimal</option>
              <option value="kinetic">Kinetic</option>
              <option value="creator">Creator</option>
              <option value="high-impact">High Impact</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-6 pt-1">
          {(
            [
              ['autoBroll', 'Automatic B-roll'],
              ['autoMusic', 'Automatic music'],
              ['aiOptimization', 'AI optimization'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={config[key]}
                onChange={(e) => setConfig({ ...config, [key]: e.target.checked })}
                className="h-4 w-4 accent-brand-500"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {submitError && <p className="mb-4 text-sm text-red-400">{submitError}</p>}

      <button onClick={() => void handleSubmit()} disabled={submitting} className="btn-primary">
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Generate Clips
      </button>
    </div>
  )
}
