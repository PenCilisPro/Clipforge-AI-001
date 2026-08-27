import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlusCircle, FolderOpen, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Project, Video } from '@/lib/types'
import { formatDuration } from '@/lib/format'
import { PageHeader, StatusBadge, ProgressBar, EmptyState, LoadingState } from '@/components/ui'
import { format } from 'date-fns'

const ACTIVE_STATUSES = new Set(['UPLOADING','QUEUED','DOWNLOADING','EXTRACTING_AUDIO','TRANSCRIBING','ANALYZING','MATCHING_PATTERNS','FINDING_CLIPS','GENERATING_CONFIG','RENDERING','ADDING_CAPTIONS','FINDING_BROLL','ADDING_MUSIC','UPLOADING_RENDER'])
const stageLabel = (status: string) => status.toLowerCase().replaceAll('_', ' ')

export default function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [videos, setVideos] = useState<Record<string, Video>>({})

  const load = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    const list = (data as Project[]) ?? []
    setProjects(list)
    if (!list.length) return setVideos({})
    const { data: vids } = await supabase.from('videos').select('*').in('project_id', list.map((p) => p.id))
    const byProject: Record<string, Video> = {}
    for (const v of (vids as Video[]) ?? []) byProject[v.project_id] = v
    setVideos(byProject)
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 1500)
    return () => window.clearInterval(timer)
  }, [load])

  if (!projects) return <LoadingState />
  const activeProjects = projects.filter((p) => ACTIVE_STATUSES.has(p.status))

  return (
    <div>
      <PageHeader title="Projects" subtitle={`${projects.length} project${projects.length === 1 ? '' : 's'}`} actions={<Link to="/create" className="btn-primary"><PlusCircle className="h-4 w-4" /> Create New Project</Link>} />
      {activeProjects.length > 0 && <section className="mb-6 rounded-xl border border-brand-500/20 bg-brand-500/5 p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-zinc-100">Processing Queue</h2><p className="mt-0.5 text-xs text-zinc-500">Live status from the background worker</p></div><span className="rounded-full bg-brand-500/15 px-2 py-1 text-[11px] font-semibold text-brand-300">{activeProjects.length} active</span></div><div className="space-y-3">{activeProjects.map((p) => { const progress = Math.max(0, Math.min(99, Number(p.progress || 0))); return <Link key={p.id} to={`/projects/${p.id}`} className="block rounded-lg border border-surface-700 bg-surface-900/80 p-3 hover:border-brand-500/40"><div className="mb-2 flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-100">{p.name}</p><p className="mt-0.5 text-[11px] capitalize text-brand-400">{stageLabel(p.status)}…</p></div><span className="shrink-0 font-mono text-xs font-bold tabular-nums text-zinc-300">{progress}%</span></div><ProgressBar value={progress} /><p className="mt-2 text-[11px] text-zinc-500">Progress is read from the project record while the background worker processes and renders the video.</p></Link> })}</div></section>}
      {projects.length === 0 ? <EmptyState icon={<FolderOpen className="h-10 w-10" />} title="No projects yet" message="Create your first project and turn long-form content into Shorts." action={<Link to="/create" className="btn-primary">Create Project</Link>} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{projects.map((p) => { const video = videos[p.id]; const isActive = ACTIVE_STATUSES.has(p.status); const isComplete = p.status === 'COMPLETED'; const isFailed = p.status === 'FAILED'; const progress = Math.max(0, Math.min(100, Number(p.progress || 0))); return <Link key={p.id} to={`/projects/${p.id}`} className="card group overflow-hidden"><div className="relative aspect-video bg-surface-850">{video?.thumbnail_url ? <img src={video.thumbnail_url} alt={p.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-zinc-600"><FolderOpen className="h-8 w-8" /></div>}{video?.duration != null && <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium">{formatDuration(video.duration)}</span>}{isActive && <div className="absolute inset-x-0 bottom-0 bg-black/75 px-3 py-2 backdrop-blur-sm"><div className="mb-1 flex items-center justify-between text-[10px] font-semibold"><span className="flex items-center gap-1 text-brand-300"><Loader2 className="h-3 w-3 animate-spin" /> {stageLabel(p.status)}…</span><span className="text-zinc-300">{Math.min(99, progress)}%</span></div><ProgressBar value={Math.min(99, progress)} /></div>}{isComplete && <div className="absolute left-2 top-2 rounded-full bg-emerald-500/90 p-1 text-white"><CheckCircle2 className="h-4 w-4" /></div>}{isFailed && <div className="absolute left-2 top-2 rounded-full bg-red-500/90 p-1 text-white"><AlertCircle className="h-4 w-4" /></div>}</div><div className="p-4"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="truncate font-semibold group-hover:text-brand-400">{p.name}</h3><StatusBadge status={p.status} /></div>{isActive && <div className="mb-2 text-xs text-zinc-500">Live backend progress: <span className="font-semibold text-zinc-300">{progress}%</span></div>}{isFailed && p.error_message && <p className="mb-2 line-clamp-2 text-xs text-red-400">{p.error_message}</p>}<p className="text-xs text-zinc-500">{p.source_type === 'youtube' ? 'YouTube import' : 'Uploaded file'} · {format(new Date(p.created_at), 'MMM d, yyyy')}</p></div></Link> })}</div>}
    </div>
  )
}