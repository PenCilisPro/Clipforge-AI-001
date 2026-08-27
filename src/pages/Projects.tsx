import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlusCircle, FolderOpen } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Project, Video } from '@/lib/types'
import { formatDuration } from '@/lib/format'
import { PageHeader, StatusBadge, ProgressBar, EmptyState, LoadingState } from '@/components/ui'
import { format } from 'date-fns'

export default function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [videos, setVideos] = useState<Record<string, Video>>({})

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })

      if (cancelled) return

      const list = (data as Project[]) ?? []
      setProjects(list)

      if (list.length > 0) {
        const { data: vids } = await supabase
          .from('videos')
          .select('*')
          .in('project_id', list.map((p) => p.id))
        if (cancelled) return

        const byProject: Record<string, Video> = {}
        for (const v of (vids as Video[]) ?? []) byProject[v.project_id] = v
        setVideos(byProject)
      }
    }

    void load()
    const interval = setInterval(() => void load(), 2000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (!projects) return <LoadingState />

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} project${projects.length === 1 ? '' : 's'}`}
        actions={
          <Link to="/create" className="btn-primary">
            <PlusCircle className="h-4 w-4" /> Create New Project
          </Link>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-10 w-10" />}
          title="No projects yet"
          message="Create your first project and turn long-form content into Shorts."
          action={
            <Link to="/create" className="btn-primary">
              Create Project
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const video = videos[p.id]
            const progress = Math.max(0, Math.min(100, Number(p.progress ?? 0)))
            const isFinished = p.status === 'COMPLETED'
            const isFailed = p.status === 'FAILED'

            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="card group overflow-hidden">
                <div className="relative aspect-video bg-surface-850">
                  {video?.thumbnail_url ? (
                    <img
                      src={video.thumbnail_url}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-zinc-600">
                      <FolderOpen className="h-8 w-8" />
                    </div>
                  )}
                  {video?.duration != null && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium">
                      {formatDuration(video.duration)}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="truncate font-semibold group-hover:text-brand-400">{p.name}</h3>
                    <StatusBadge status={p.status} />
                  </div>
                  {!isFinished && !isFailed && (
                    <div className="mb-2">
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="font-medium capitalize text-brand-400">
                          {p.status.toLowerCase().replaceAll('_', ' ')}
                        </span>
                        <span className="font-bold tabular-nums text-zinc-400">
                          {Math.round(progress)}%
                        </span>
                      </div>
                      <ProgressBar value={progress} />
                    </div>
                  )}
                  <p className="text-xs text-zinc-500">
                    {p.source_type === 'youtube' ? 'YouTube import' : 'Uploaded file'} ·{' '}
                    {format(new Date(p.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
