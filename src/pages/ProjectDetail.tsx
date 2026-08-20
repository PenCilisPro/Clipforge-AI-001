import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Film, RefreshCw, Sparkles, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { processProjectInBrowser } from '@/lib/clientProcessor'
import type { Project, Video, Transcript, Clip } from '@/lib/types'
import { normalizeClipConfiguration } from '@/lib/types'
import { formatDuration, formatTimestamp } from '@/lib/format'
import {
  PageHeader,
  StatusBadge,
  LoadingState,
  Modal,
} from '@/components/ui'
import ClipCard from '@/components/ClipCard'
import { ProcessingProgressTracker } from '@/components/ProcessingProgressTracker'
import { RemotionPlayerPreview } from '@/components/remotion/RemotionPlayerPreview'

type SortKey = 'score' | 'duration' | 'pattern' | 'status'

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [video, setVideo] = useState<Video | null>(null)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [clips, setClips] = useState<Clip[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [previewClip, setPreviewClip] = useState<Clip | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const loadAll = useCallback(async () => {
    if (!projectId) return
    const [p, v, t, c] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('videos').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('transcripts').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('clips').select('*').eq('project_id', projectId),
    ])
    setProject(p.data as Project | null)
    setVideo(v.data as Video | null)
    setTranscript(t.data as Transcript | null)
    setClips((c.data as Clip[]) ?? [])
  }, [projectId])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // Poll faster (1.5s) while processing so the user sees live progress step updates
  useEffect(() => {
    if (!project || ['COMPLETED', 'FAILED'].includes(project.status)) return
    const interval = setInterval(() => void loadAll(), 1500)
    return () => clearInterval(interval)
  }, [project, loadAll])

  async function handleRunAiProcessing() {
    if (!projectId) return
    setRetrying(true)
    try {
      await processProjectInBrowser(projectId)
      await loadAll()
    } catch (e: any) {
      console.error(e)
    } finally {
      setRetrying(false)
    }
  }

  async function approveClip(clip: Clip) {
    await supabase.from('clips').update({ approved: true, status: 'APPROVED' }).eq('id', clip.id)
    await loadAll()
  }

  if (!project) return <LoadingState />

  const sortedClips = [...clips].sort((a, b) => {
    switch (sortKey) {
      case 'score':
        return b.score - a.score
      case 'duration':
        return b.duration - a.duration
      case 'pattern':
        return (a.matched_pattern_name ?? 'zzz').localeCompare(b.matched_pattern_name ?? 'zzz')
      case 'status':
        return a.status.localeCompare(b.status)
    }
  })

  const isProcessing = !['COMPLETED', 'FAILED'].includes(project.status)

  return (
    <div>
      <PageHeader
        title={project.name}
        subtitle={project.source_type === 'youtube' ? project.source_url ?? '' : 'Uploaded video'}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={project.status} />
            {project.status !== 'COMPLETED' && (
              <button
                onClick={() => void handleRunAiProcessing()}
                disabled={retrying}
                className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1.5 shadow-sm"
              >
                {retrying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                )}
                {retrying ? 'Processing AI Clips...' : 'Process with AI Now'}
              </button>
            )}
          </div>
        }
      />

      {/* Real-time 5-Step Pipeline Progress Tracker */}
      <ProcessingProgressTracker
        status={project.status}
        progress={project.progress}
        onRunAiNow={() => void handleRunAiProcessing()}
        isProcessingNow={retrying}
        errorMessage={project.error_message}
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <div className="aspect-video bg-surface-850">
            {video?.thumbnail_url ? (
              <img
                src={video.thumbnail_url}
                alt={project.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-600">
                <Film className="h-10 w-10" />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{video?.title ?? project.name}</p>
              <p className="text-xs text-zinc-500">
                Duration: {formatDuration(video?.duration)} · {clips.length} clips generated
              </p>
            </div>
            {transcript && (
              <button onClick={() => setShowTranscript(true)} className="btn-secondary">
                View Transcript
              </button>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Project Settings
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Clip duration</dt>
              <dd>{project.clip_duration_preset === 'ai' ? 'AI Optimized' : `${project.clip_duration_preset}s`}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Max clips</dt>
              <dd>{project.max_clips}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Auto B-roll</dt>
              <dd>{project.auto_broll ? 'On' : 'Off'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Auto music</dt>
              <dd>{project.auto_music ? 'On' : 'Off'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Caption preset</dt>
              <dd className="capitalize">{project.caption_preset}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Generated Clips</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => void loadAll()} className="btn-ghost !px-2" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
          <select
            className="input !w-auto"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="score">Sort by Score</option>
            <option value="duration">Sort by Duration</option>
            <option value="pattern">Sort by Pattern</option>
            <option value="status">Sort by Status</option>
          </select>
        </div>
      </div>

      {clips.length === 0 ? (
        <div className="card px-6 py-12 text-center text-sm text-zinc-500">
          {isProcessing
            ? 'Your AI-generated clips will appear here as processing completes.'
            : 'Your AI-generated clips will appear here.'}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sortedClips.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              onApprove={(c) => void approveClip(c)}
              onPreview={setPreviewClip}
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(previewClip)}
        onClose={() => setPreviewClip(null)}
        title={previewClip?.title ?? 'Clip Preview'}
      >
        {previewClip && (
          <div className="space-y-4">
            <div className="flex justify-center py-2">
              {previewClip.current_render_url ? (
                <video
                  src={previewClip.current_render_url}
                  controls
                  autoPlay
                  className="aspect-[9/16] w-full max-w-[280px] rounded-xl bg-black object-contain shadow-2xl"
                />
              ) : (
                <div className="w-full max-w-[280px]">
                  <RemotionPlayerPreview
                    config={normalizeClipConfiguration(
                      null,
                      previewClip,
                      {
                        sourceUrl: project?.source_url || (video as any)?.storage_path,
                        thumbnailUrl: previewClip.current_thumbnail_url || (project as any)?.thumbnail_url,
                        storagePath: (video as any)?.storage_path,
                        sourceType: project?.source_type,
                        transcript,
                      },
                    )}
                  />
                </div>
              )}
            </div>

            <div className="rounded-lg bg-surface-850 p-3 text-xs space-y-1.5">
              {previewClip.hook && (
                <p className="text-zinc-300">
                  <span className="font-semibold text-brand-400">Viral Hook:</span> &ldquo;{previewClip.hook}&rdquo;
                </p>
              )}
              {previewClip.matched_pattern_name && (
                <p className="text-zinc-400">
                  <span className="font-semibold text-zinc-300">Pattern:</span> {previewClip.matched_pattern_name}
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Link
                to={`/clips/${previewClip.id}/studio`}
                className="btn-primary flex-1 justify-center !py-2 text-xs"
                onClick={() => setPreviewClip(null)}
              >
                <Sparkles className="h-4 w-4" /> Open in Remotion Clip Studio
              </Link>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={showTranscript}
        onClose={() => setShowTranscript(false)}
        title="Transcript"
        wide
      >
        <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
          {transcript?.segments.map((seg, i) => (
            <p key={i}>
              <span className="mr-2 font-mono text-xs text-brand-400">
                {formatTimestamp(seg.start)}
              </span>
              <span className="text-zinc-300">{seg.text}</span>
            </p>
          ))}
        </div>
      </Modal>
    </div>
  )
}
