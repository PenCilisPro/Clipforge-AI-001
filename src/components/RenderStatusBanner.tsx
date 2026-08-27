import { useEffect, useMemo, useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, Clapperboard } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Job {
  id: string
  clip_id: string
  status: string
  progress: number | null
  stage: string | null
  error_message: string | null
  created_at: string
}

const ACTIVE = ['QUEUED', 'PREPARING', 'RENDERING', 'UPLOADING']

function friendlyStage(stage: string | null, status: string) {
  const value = (stage || status).toUpperCase()
  if (value.includes('BROLL')) return 'Preparing B-roll'
  if (value.includes('BUNDL')) return 'Preparing Remotion'
  if (value.includes('RENDER')) return 'Remotion is rendering your video'
  if (value.includes('UPLOAD')) return 'Uploading the finished MP4'
  if (value.includes('VALIDAT')) return 'Validating the finished video'
  if (value.includes('PLAN') || value.includes('PREPAR')) return 'Preparing the edit'
  if (value.includes('CLAIM')) return 'Remotion worker has picked up the job'
  return 'Waiting for Remotion'
}

export default function RenderStatusBanner() {
  const [jobs, setJobs] = useState<Job[]>([])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const { data } = await supabase
        .from('render_jobs')
        .select('id,clip_id,status,progress,stage,error_message,created_at')
        .in('status', ACTIVE)
        .order('created_at', { ascending: false })
        .limit(3)
      if (mounted) setJobs((data as Job[]) ?? [])
    }

    void load()
    const interval = window.setInterval(() => void load(), 1500)
    return () => {
      mounted = false
      window.clearInterval(interval)
    }
  }, [])

  const latest = useMemo(() => jobs[0] ?? null, [jobs])
  if (!latest) return null

  const progress = Math.max(0, Math.min(99, Number(latest.progress ?? 0)))
  const stage = friendlyStage(latest.stage, latest.status)

  return (
    <div className="mx-auto mb-4 w-full max-w-7xl rounded-xl border border-brand-500/30 bg-brand-500/10 p-3 shadow-lg shadow-brand-500/5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300">
          <Clapperboard className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs font-semibold text-zinc-100">{stage}</p>
            <span className="shrink-0 text-xs font-mono font-semibold text-brand-300">{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-800">
            <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
        {latest.status === 'RENDERING' || latest.status === 'PREPARING' || latest.status === 'UPLOADING' ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-400" />
        ) : latest.status === 'COMPLETED' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
        )}
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">
        This status comes from the background Remotion worker. It will not reach 100% until the finished video is uploaded.
      </p>
    </div>
  )
}
