import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Download,
  Mic,
  FileText,
  Sparkles,
  Scissors,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RotateCw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { ProcessingStatus } from '@/lib/types'
import { classNames } from '@/lib/format'

export interface ProgressStep {
  id: string
  label: string
  description: string
  icon: typeof Download
  matchStatuses: ProcessingStatus[]
}

const PIPELINE_STEPS: ProgressStep[] = [
  { id: 'download', label: 'Download Video', description: 'Fetching the source video and preparing the local media file.', icon: Download, matchStatuses: ['UPLOADING', 'QUEUED', 'DOWNLOADING'] },
  { id: 'audio', label: 'Extract Audio', description: 'Preparing the audio stream for transcription and analysis.', icon: Mic, matchStatuses: ['EXTRACTING_AUDIO'] },
  { id: 'transcribe', label: 'AI Transcription', description: 'Generating timestamped speech-to-text data.', icon: FileText, matchStatuses: ['TRANSCRIBING'] },
  { id: 'analyze', label: 'Viral Pattern Analysis', description: 'Finding and scoring the strongest clip candidates.', icon: Sparkles, matchStatuses: ['ANALYZING', 'MATCHING_PATTERNS', 'FINDING_CLIPS'] },
  { id: 'clips', label: 'Clip Generation', description: 'Preparing clip configuration, captions, B-roll and music.', icon: Scissors, matchStatuses: ['GENERATING_CONFIG', 'FINDING_BROLL', 'ADDING_MUSIC'] },
  { id: 'render', label: 'Video Rendering', description: 'FFmpeg / Remotion renders the actual finished video.', icon: Scissors, matchStatuses: ['RENDERING', 'ADDING_CAPTIONS', 'UPLOADING_RENDER'] },
]

const STATUS_DETAILS: Partial<Record<ProcessingStatus, string>> = {
  UPLOADING: 'Waiting for the source upload to finish...',
  QUEUED: 'Queued. No processing has started yet.',
  DOWNLOADING: 'Downloading the source video in the background...',
  EXTRACTING_AUDIO: 'Extracting audio from the source video...',
  TRANSCRIBING: 'AI transcription is running...',
  ANALYZING: 'Analyzing the transcript for high-value moments...',
  MATCHING_PATTERNS: 'Matching the video against your viral patterns...',
  FINDING_CLIPS: 'Selecting and scoring the best clip candidates...',
  GENERATING_CONFIG: 'Preparing the final clip configurations...',
  FINDING_BROLL: 'Finding synchronized B-roll footage...',
  ADDING_MUSIC: 'Preparing the selected background music...',
  RENDERING: 'Rendering is active. Progress below comes from the backend render jobs.',
  ADDING_CAPTIONS: 'Adding captions during the render pipeline...',
  UPLOADING_RENDER: 'Uploading the finished rendered MP4...',
  COMPLETED: 'The finished video has been rendered and uploaded successfully.',
}

export function ProcessingProgressTracker({
  status,
  progress,
  onRunAiNow,
  isProcessingNow,
  errorMessage,
}: {
  status: ProcessingStatus
  progress: number
  onRunAiNow?: () => void
  isProcessingNow?: boolean
  errorMessage?: string | null
}) {
  const { projectId } = useParams<{ projectId: string }>()
  const [renderProgress, setRenderProgress] = useState(0)

  // Render progress is deliberately read from render_jobs. It never falls back
  // to a guessed percentage, so a queued/not-started render is honestly 0%.
  useEffect(() => {
    if (!projectId || !['RENDERING', 'ADDING_CAPTIONS', 'UPLOADING_RENDER'].includes(status)) {
      setRenderProgress(0)
      return
    }

    let cancelled = false

    const loadRenderProgress = async () => {
      const { data: clips, error: clipsError } = await supabase
        .from('clips')
        .select('id')
        .eq('project_id', projectId)

      if (cancelled || clipsError || !clips?.length) {
        if (!cancelled) setRenderProgress(0)
        return
      }

      const clipIds = clips.map((clip) => clip.id)
      const { data: jobs, error: jobsError } = await supabase
        .from('render_jobs')
        .select('status, progress')
        .in('clip_id', clipIds)

      if (cancelled || jobsError || !jobs?.length) {
        if (!cancelled) setRenderProgress(0)
        return
      }

      const values = jobs.map((job) => {
        if (job.status === 'COMPLETED') return 100
        if (job.status === 'FAILED') return 0
        return Math.max(0, Math.min(100, Number(job.progress ?? 0)))
      })

      const average = values.reduce((sum, value) => sum + value, 0) / values.length
      if (!cancelled) setRenderProgress(Math.round(average))
    }

    void loadRenderProgress()
    const interval = setInterval(() => void loadRenderProgress(), 1500)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [projectId, status])

  const isFailed = status === 'FAILED'
  const isComplete = status === 'COMPLETED'
  const pipelineProgress = Math.max(0, Math.min(100, Number.isFinite(Number(progress)) ? Number(progress) : 0))
  const isRenderStage = ['RENDERING', 'ADDING_CAPTIONS', 'UPLOADING_RENDER'].includes(status)
  const displayProgress = isComplete ? 100 : isRenderStage ? renderProgress : pipelineProgress

  let activeStepIndex = 0
  if (isComplete) {
    activeStepIndex = PIPELINE_STEPS.length
  } else {
    const found = PIPELINE_STEPS.findIndex((step) => step.matchStatuses.includes(status))
    activeStepIndex = found >= 0 ? found : 0
  }

  const currentStep = PIPELINE_STEPS[activeStepIndex]
  const statusText = STATUS_DETAILS[status] ?? 'Waiting for the backend processing pipeline...'

  return (
    <div className="card mb-8 overflow-hidden border border-surface-700 bg-surface-900/90 shadow-xl backdrop-blur-sm">
      <div className="border-b border-surface-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
              {isComplete ? <CheckCircle2 className="h-6 w-6 text-emerald-400" /> : isFailed ? <AlertCircle className="h-6 w-6 text-rose-400" /> : <Loader2 className="h-5 w-5 animate-spin" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-zinc-100">{isComplete ? 'Processing Complete' : isFailed ? 'Processing Interrupted' : currentStep?.label ?? 'Waiting to process'}</h3>
                <span className="rounded-md bg-surface-800 px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-400">{Math.round(displayProgress)}%</span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">{statusText}</p>
            </div>
          </div>

          {onRunAiNow && isFailed && (
            <button type="button" onClick={onRunAiNow} disabled={isProcessingNow} className="btn-primary !px-3.5 !py-1.5 text-xs font-medium flex items-center gap-1.5">
              {isProcessingNow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
              {isProcessingNow ? 'Retrying...' : 'Retry'}
            </button>
          )}
        </div>

        <div className="mt-4" aria-label={`Processing progress: ${Math.round(displayProgress)} percent`}>
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-800">
            <div
              className={classNames('h-full rounded-full transition-all duration-700 ease-out', isFailed ? 'bg-rose-500' : isComplete ? 'bg-emerald-500' : 'bg-gradient-to-r from-brand-600 via-brand-500 to-indigo-400')}
              style={{ width: `${displayProgress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-surface-800 bg-surface-950/40 sm:grid-cols-6 sm:divide-x sm:divide-y-0">
        {PIPELINE_STEPS.map((step, idx) => {
          const Icon = step.icon
          const isDone = isComplete || idx < activeStepIndex
          const isCurrent = !isComplete && !isFailed && idx === activeStepIndex
          const stepProgress = isCurrent && isRenderStage ? renderProgress : isDone ? 100 : 0

          return (
            <div key={step.id} className={classNames('relative flex min-h-[150px] flex-col justify-between p-4', isCurrent ? 'bg-brand-500/5' : '')}>
              <div className="flex items-center justify-between">
                <div className={classNames('flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold', isDone ? 'bg-emerald-500/20 text-emerald-400' : isCurrent ? 'bg-brand-500 text-white' : 'bg-surface-800 text-zinc-500')}>
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                </div>
                <Icon className={classNames('h-4 w-4', isDone ? 'text-emerald-400' : isCurrent ? 'animate-pulse text-brand-400' : 'text-zinc-600')} />
              </div>

              <div className="mt-3">
                <span className={classNames('text-xs font-semibold', isDone ? 'text-zinc-200' : isCurrent ? 'text-brand-300' : 'text-zinc-500')}>{step.label}</span>
                <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-zinc-500">{step.description}</p>
              </div>

              <div className="mt-2 text-[10px] font-medium">
                {isDone ? <span className="text-emerald-400">Completed · 100%</span> : isCurrent ? <span className="text-brand-400">In progress · {Math.round(stepProgress)}%</span> : <span className="text-zinc-600">Not started · 0%</span>}
              </div>
            </div>
          )
        })}
      </div>

      {isFailed && (
        <div className="border-t border-rose-500/20 bg-rose-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
            <div>
              <h4 className="text-xs font-semibold text-rose-200">Pipeline Execution Error</h4>
              <p className="mt-0.5 text-xs text-rose-300">{errorMessage || 'Video processing encountered an issue.'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
