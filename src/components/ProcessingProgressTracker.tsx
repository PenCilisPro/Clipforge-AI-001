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
import type { ProcessingStatus } from '@/lib/types'
import { classNames } from '@/lib/format'

export interface ProgressStep {
  id: string
  label: string
  description: string
  icon: typeof Download
  matchStatuses: ProcessingStatus[]
  minProgress: number
}

const PIPELINE_STEPS: ProgressStep[] = [
  {
    id: 'download',
    label: 'Download Video',
    description: 'Fetching HD stream & metadata from YouTube CDN',
    icon: Download,
    matchStatuses: ['QUEUED', 'DOWNLOADING'],
    minProgress: 15,
  },
  {
    id: 'audio',
    label: 'Extract Audio',
    description: 'Isolating voice frequencies & waveform processing',
    icon: Mic,
    matchStatuses: ['EXTRACTING_AUDIO'],
    minProgress: 30,
  },
  {
    id: 'transcribe',
    label: 'AI Transcription',
    description: 'High-precision speech-to-text & word timestamps',
    icon: FileText,
    matchStatuses: ['TRANSCRIBING'],
    minProgress: 50,
  },
  {
    id: 'analyze',
    label: 'Viral Pattern Analysis',
    description: 'Evaluating hooks & retention scores with GPT-4o',
    icon: Sparkles,
    matchStatuses: ['ANALYZING', 'MATCHING_PATTERNS', 'FINDING_CLIPS'],
    minProgress: 75,
  },
  {
    id: 'clips',
    label: 'Clip Generation',
    description: 'Composing 9:16 vertical videos & dynamic captions',
    icon: Scissors,
    matchStatuses: ['GENERATING_CONFIG', 'RENDERING', 'ADDING_CAPTIONS', 'FINDING_BROLL', 'ADDING_MUSIC', 'UPLOADING_RENDER'],
    minProgress: 90,
  },
]

const STATUS_DETAILS: Partial<Record<ProcessingStatus, string>> = {
  QUEUED: 'Initializing pipeline queue and validating video stream...',
  DOWNLOADING: 'Connecting to YouTube downloader and streaming video frames...',
  EXTRACTING_AUDIO: 'Extracting clean audio channel for high-accuracy speech detection...',
  TRANSCRIBING: 'OpenAI Whisper is transcribing spoken words and time intervals...',
  ANALYZING: 'AI is scanning transcript for high-impact viral moments and hooks...',
  MATCHING_PATTERNS: 'Matching content against viral patterns (The Secret, The Warning, The How-To)...',
  FINDING_CLIPS: 'Scoring viral probability, emotional hooks, and shareability...',
  GENERATING_CONFIG: 'Assembling 9:16 vertical viewport framing and kinetic captions...',
  RENDERING: 'Remotion video engine is rendering motion graphics and subtitles...',
  ADDING_CAPTIONS: 'Styling animated karaoke captions and keyword highlights...',
  FINDING_BROLL: 'Finding synchronized overlay B-roll footage...',
  ADDING_MUSIC: 'Matching background audio track with auto-ducking...',
  UPLOADING_RENDER: 'Saving generated clips to your Supabase cloud storage...',
  COMPLETED: 'All viral clips successfully generated and ready to review!',
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
  const isFailed = status === 'FAILED'
  const isComplete = status === 'COMPLETED'

  // Determine current active step index
  let activeStepIndex = 0
  if (isComplete) {
    activeStepIndex = PIPELINE_STEPS.length
  } else {
    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      if (PIPELINE_STEPS[i].matchStatuses.includes(status)) {
        activeStepIndex = i
        break
      }
    }
  }

  // Calculate dynamic display progress
  const displayProgress = isComplete
    ? 100
    : Math.max(progress, PIPELINE_STEPS[activeStepIndex]?.minProgress || 10)

  return (
    <div className="card mb-8 overflow-hidden border border-surface-700 bg-surface-900/90 shadow-xl backdrop-blur-sm">
      {/* Top Header with Live Status & Percentage */}
      <div className="border-b border-surface-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
              {isComplete ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              ) : isFailed ? (
                <AlertCircle className="h-6 w-6 text-rose-400" />
              ) : (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75"></span>
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500"></span>
                  </span>
                </>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-zinc-100">
                  {isComplete
                    ? 'Processing Complete'
                    : isFailed
                      ? 'Processing Interrupted'
                      : 'Processing Video & Generating AI Clips'}
                </h3>
                <span className="rounded-md bg-surface-800 px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-400">
                  {Math.round(displayProgress)}%
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">
                {STATUS_DETAILS[status] ?? 'Processing pipeline active...'}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {onRunAiNow && !isComplete && (
              <button
                type="button"
                onClick={onRunAiNow}
                disabled={isProcessingNow}
                className="btn-primary !px-3.5 !py-1.5 text-xs font-medium flex items-center gap-1.5 shadow-md hover:shadow-brand-500/20"
              >
                {isProcessingNow ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                )}
                {isProcessingNow ? 'AI Generating Clips...' : 'Process with AI Now'}
              </button>
            )}
          </div>
        </div>

        {/* Big Animated Progress Bar */}
        <div className="mt-4">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-800">
            <div
              className={classNames(
                'h-full rounded-full transition-all duration-700 ease-out',
                isFailed
                  ? 'bg-rose-500'
                  : isComplete
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-brand-600 via-brand-500 to-indigo-400',
              )}
              style={{ width: `${Math.min(100, Math.max(5, displayProgress))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 5-Step Pipeline Visual Grid */}
      <div className="grid grid-cols-1 divide-y divide-surface-800 bg-surface-950/40 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {PIPELINE_STEPS.map((step, idx) => {
          const Icon = step.icon
          const isDone = idx < activeStepIndex || isComplete
          const isCurrent = idx === activeStepIndex && !isComplete && !isFailed

          return (
            <div
              key={step.id}
              className={classNames(
                'relative flex flex-col justify-between p-4 transition-colors',
                isCurrent ? 'bg-brand-500/5' : '',
              )}
            >
              {/* Top step index & status indicator */}
              <div className="flex items-center justify-between">
                <div
                  className={classNames(
                    'flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition-all',
                    isDone
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : isCurrent
                        ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                        : 'bg-surface-800 text-zinc-500',
                  )}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                </div>

                <Icon
                  className={classNames(
                    'h-4 w-4 transition-colors',
                    isDone
                      ? 'text-emerald-400'
                      : isCurrent
                        ? 'text-brand-400 animate-pulse'
                        : 'text-zinc-600',
                  )}
                />
              </div>

              {/* Step info */}
              <div className="mt-3">
                <div className="flex items-center gap-1.5">
                  <span
                    className={classNames(
                      'text-xs font-semibold',
                      isDone
                        ? 'text-zinc-200'
                        : isCurrent
                          ? 'text-brand-300'
                          : 'text-zinc-500',
                    )}
                  >
                    {step.label}
                  </span>
                  {isCurrent && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-400 animate-ping" />
                  )}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500 line-clamp-2">
                  {step.description}
                </p>
              </div>

              {/* Bottom active pill if current */}
              {isCurrent && (
                <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-brand-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>In progress...</span>
                </div>
              )}
              {isDone && (
                <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                  <span>Completed ✓</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Error message if failed */}
      {isFailed && (
        <div className="border-t border-rose-500/20 bg-rose-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
            <div className="flex-1">
              <h4 className="text-xs font-semibold text-rose-200">Pipeline Execution Error</h4>
              <p className="mt-0.5 text-xs text-rose-300">
                {errorMessage || 'Video processing encountered an issue. Tap "Process with AI Now" to generate clips instantly.'}
              </p>
            </div>
            {onRunAiNow && (
              <button
                type="button"
                onClick={onRunAiNow}
                className="btn-secondary !py-1 !px-2 text-xs flex items-center gap-1 shrink-0"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Retry Now
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
