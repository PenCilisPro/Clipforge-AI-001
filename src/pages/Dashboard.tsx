import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PlusCircle,
  Upload,
  FileSpreadsheet,
  CalendarDays,
  AlertTriangle,
} from 'lucide-react'
import { YoutubeIcon } from '@/components/icons'
import { supabase } from '@/lib/supabase'
import type { Project, Clip, ScheduledPost } from '@/lib/types'
import { formatCount, formatDuration } from '@/lib/format'
import { PageHeader, StatCard, StatusBadge, ScoreBadge, ProgressBar, LoadingState } from '@/components/ui'
import { format } from 'date-fns'

interface DashboardData {
  videosProcessed: number
  clipsGenerated: number
  scheduled: number
  published: number
  totalViews: number
  recentProjects: Project[]
  processingProjects: Project[]
  upcomingPosts: ScheduledPost[]
  topClips: Clip[]
  failedPosts: ScheduledPost[]
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    const [projects, clipsCount, posts, topClips, viewsRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('clips').select('id', { count: 'exact', head: true }),
      supabase.from('scheduled_posts').select('*').order('scheduled_at'),
      supabase.from('clips').select('*').order('score', { ascending: false }).limit(5),
      supabase.from('analytics').select('views'),
    ])
    const allProjects = (projects.data as Project[]) ?? []
    const allPosts = (posts.data as ScheduledPost[]) ?? []
    const totalViews =
      (viewsRes.data as Array<{ views: number }> | null)?.reduce((sum, r) => sum + r.views, 0) ?? 0

    setData({
      videosProcessed: allProjects.filter((p) => p.status === 'COMPLETED').length,
      clipsGenerated: clipsCount.count ?? 0,
      scheduled: allPosts.filter((p) => p.status === 'SCHEDULED').length,
      published: allPosts.filter((p) => p.status === 'PUBLISHED').length,
      totalViews,
      recentProjects: allProjects.slice(0, 5),
      processingProjects: allProjects.filter(
        (p) => !['COMPLETED', 'FAILED'].includes(p.status),
      ),
      upcomingPosts: allPosts.filter((p) => p.status === 'SCHEDULED').slice(0, 5),
      topClips: (topClips.data as Clip[]) ?? [],
      failedPosts: allPosts.filter((p) => p.status === 'FAILED'),
    })
  }

  if (!data) return <LoadingState />

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Your AI clipping studio at a glance"
        actions={
          <Link to="/create" className="btn-primary">
            <PlusCircle className="h-4 w-4" /> Create New Project
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Videos Processed" value={String(data.videosProcessed)} />
        <StatCard label="Clips Generated" value={data.clipsGenerated.toLocaleString()} />
        <StatCard label="Scheduled" value={String(data.scheduled)} />
        <StatCard label="Published" value={data.published.toLocaleString()} />
        <StatCard label="Total Views" value={formatCount(data.totalViews)} />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link to="/create" className="btn-secondary">
          <YoutubeIcon className="h-4 w-4 text-brand-400" /> Import YouTube Video
        </Link>
        <Link to="/create?tab=upload" className="btn-secondary">
          <Upload className="h-4 w-4 text-brand-400" /> Upload Video
        </Link>
        <Link to="/csv-import" className="btn-secondary">
          <FileSpreadsheet className="h-4 w-4 text-brand-400" /> Import CSV Patterns
        </Link>
        <Link to="/calendar" className="btn-secondary">
          <CalendarDays className="h-4 w-4 text-brand-400" /> Open Calendar
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Processing Jobs
          </h2>
          {data.processingProjects.length === 0 ? (
            <p className="text-sm text-zinc-500">No videos are processing right now.</p>
          ) : (
            <ul className="space-y-3">
              {data.processingProjects.map((p) => (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`} className="block rounded-lg p-2 hover:bg-surface-800">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{p.name}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    <ProgressBar value={p.progress} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Recent Projects
          </h2>
          {data.recentProjects.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Create your first project and turn long-form content into Shorts.
            </p>
          ) : (
            <ul className="divide-y divide-surface-800">
              {data.recentProjects.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/projects/${p.id}`}
                    className="flex items-center justify-between gap-2 py-2.5 hover:text-brand-400"
                  >
                    <span className="truncate text-sm">{p.name}</span>
                    <StatusBadge status={p.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Top Performing Clips
          </h2>
          {data.topClips.length === 0 ? (
            <p className="text-sm text-zinc-500">Your AI-generated clips will appear here.</p>
          ) : (
            <ul className="divide-y divide-surface-800">
              {data.topClips.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/clips/${c.id}/studio`}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.title}</p>
                      <p className="text-xs text-zinc-500">
                        {formatDuration(c.duration)} · {c.matched_pattern_name ?? 'No pattern'}
                      </p>
                    </div>
                    <ScoreBadge score={c.score} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Upcoming Posts
          </h2>
          {data.upcomingPosts.length === 0 ? (
            <p className="text-sm text-zinc-500">Drag a clip onto the calendar to schedule it.</p>
          ) : (
            <ul className="divide-y divide-surface-800">
              {data.upcomingPosts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="text-xs text-zinc-500">
                      {p.platform === 'youtube' ? 'YouTube Shorts' : 'TikTok'} ·{' '}
                      {format(new Date(p.scheduled_at), 'MMM d, HH:mm')}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.failedPosts.length > 0 && (
          <section className="card border-red-500/30 p-5 lg:col-span-2">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-red-400">
              <AlertTriangle className="h-4 w-4" /> Failed Publishing Jobs
            </h2>
            <ul className="divide-y divide-surface-800">
              {data.failedPosts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="truncate text-xs text-red-400">{p.error_message}</p>
                  </div>
                  <Link to="/calendar" className="btn-secondary shrink-0 !py-1 text-xs">
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
