import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PlusCircle,
  Upload,
  FileSpreadsheet,
  CalendarDays,
  AlertTriangle,
  ShieldCheck,
  Lock,
  Eye,
  FileText,
  ExternalLink,
  Shield,
  CheckCircle2,
} from 'lucide-react'
import { YoutubeIcon } from '@/components/icons'
import { supabase } from '@/lib/supabase'
import type { Project, Clip, ScheduledPost } from '@/lib/types'
import { formatCount, formatDuration } from '@/lib/format'
import { PageHeader, StatCard, StatusBadge, ScoreBadge, ProgressBar, LoadingState, Modal } from '@/components/ui'
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
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [activePrivacyTab, setActivePrivacyTab] = useState<'summary' | 'ai' | 'social' | 'rights'>('summary')

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

      {/* Privacy Policy & Data Protection Card at the bottom of Dashboard */}
      <section className="mt-8 rounded-xl border border-surface-800 bg-surface-900/90 p-5 backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-100">ClipForge AI Privacy Policy & Security</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  <Lock className="h-2.5 w-2.5" /> SOC 2 & TLS 1.3
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed max-w-2xl">
                Your video media, speech transcripts, and connected social tokens are encrypted end-to-end and never used to train public AI models. You maintain 100% ownership over all source footage and generated clips.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setShowPrivacyModal(true)}
              className="btn-secondary !py-1.5 !px-3 text-xs"
            >
              <FileText className="h-3.5 w-3.5 text-brand-400" />
              Quick Policy Preview
            </button>
            <Link
              to="/privacy"
              className="btn-primary !py-1.5 !px-3 text-xs"
            >
              <span>Full Privacy Policy</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Quick Highlights Bar */}
        <div className="mt-4 grid grid-cols-1 gap-2 border-t border-surface-800 pt-3 sm:grid-cols-3 text-[11px] text-zinc-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>Zero Public Model Training</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>Encrypted Audio & Whisper Data</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>1-Click Data Purge & Revocation</span>
          </div>
        </div>
      </section>

      {/* Bottom Footer */}
      <footer className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-surface-800/80 py-4 text-xs text-zinc-500 sm:flex-row">
        <div className="flex items-center gap-2">
          <span>&copy; {new Date().getFullYear()} ClipForge AI Studio</span>
          <span>·</span>
          <span>Version 2.4.0</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowPrivacyModal(true)}
            className="hover:text-zinc-300 transition-colors cursor-pointer"
          >
            Privacy Policy
          </button>
          <Link to="/privacy" className="hover:text-zinc-300 transition-colors">
            Legal Terms
          </Link>
          <Link to="/settings" className="hover:text-zinc-300 transition-colors">
            Security Settings
          </Link>
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-300 transition-colors"
          >
            Google / YouTube Terms
          </a>
        </div>
      </footer>

      {/* Interactive Privacy Policy Modal */}
      <Modal
        open={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        title="Privacy Policy & Data Security"
        wide
      >
        <div className="space-y-4 text-xs">
          {/* Sub Navigation Tabs */}
          <div className="flex rounded-lg bg-surface-800 p-1">
            {(
              [
                { id: 'summary', label: '1. Core Protection', icon: Shield },
                { id: 'ai', label: '2. AI & Transcription', icon: Lock },
                { id: 'social', label: '3. Social Accounts', icon: ExternalLink },
                { id: 'rights', label: '4. Your Rights', icon: Eye },
              ] as const
            ).map((t) => {
              const Icon = t.icon
              const active = activePrivacyTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setActivePrivacyTab(t.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-colors ${
                    active ? 'bg-surface-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>

          {/* Tab 1: Core Protection */}
          {activePrivacyTab === 'summary' && (
            <div className="space-y-3 rounded-lg bg-surface-850 p-4 border border-surface-750 text-zinc-300">
              <h4 className="font-semibold text-white text-sm">Media Ownership & Data Privacy Guarantee</h4>
              <p>
                ClipForge AI treats your creative assets as strictly private and proprietary. We collect information necessary only to process video clipping, generate synchronized captions, and publish shorts to your authorized channels.
              </p>
              <ul className="list-disc pl-4 space-y-1 text-zinc-400">
                <li>Your raw videos and generated MP4s are stored in private, signed-access storage buckets.</li>
                <li>API keys (such as custom OpenAI Whisper keys) can be stored locally in your browser and are never logged or resold.</li>
                <li>All network requests undergo end-to-end TLS encryption.</li>
              </ul>
            </div>
          )}

          {/* Tab 2: AI & Whisper */}
          {activePrivacyTab === 'ai' && (
            <div className="space-y-3 rounded-lg bg-surface-850 p-4 border border-surface-750 text-zinc-300">
              <h4 className="font-semibold text-white text-sm">AI Audio Transcription & Processing</h4>
              <p>
                When you initiate AI Caption generation or Auto B-Roll analysis:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-zinc-400">
                <li>Audio streams are processed strictly for speech recognition and word-level alignment (Whisper).</li>
                <li>Transcripts are stored with your project to enable the Remotion editor and caption styling.</li>
                <li>No user video content or transcripts are provided to third parties for commercial AI model training.</li>
              </ul>
            </div>
          )}

          {/* Tab 3: Social Accounts */}
          {activePrivacyTab === 'social' && (
            <div className="space-y-3 rounded-lg bg-surface-850 p-4 border border-surface-750 text-zinc-300">
              <h4 className="font-semibold text-white text-sm">Connected YouTube & TikTok Permissions</h4>
              <p>
                When connecting your YouTube or TikTok creator accounts:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-zinc-400">
                <li>We request only the minimum required OAuth scopes needed to upload video shorts and retrieve basic view metrics.</li>
                <li>We never modify unrelated channel settings, post comments, or read personal private messages.</li>
                <li>You can disconnect and revoke access at any time from the Settings page.</li>
              </ul>
            </div>
          )}

          {/* Tab 4: Your Rights */}
          {activePrivacyTab === 'rights' && (
            <div className="space-y-3 rounded-lg bg-surface-850 p-4 border border-surface-750 text-zinc-300">
              <h4 className="font-semibold text-white text-sm">Data Retention & Complete Purge</h4>
              <p>
                You retain full autonomy over your data:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-zinc-400">
                <li>You can delete individual clips, project videos, or version histories instantly.</li>
                <li>Account deletion permanently purges all associated files, database records, and credentials from our servers.</li>
                <li>For formal data export or privacy requests, email us at <span className="text-brand-400 font-mono">privacy@clipforge.app</span>.</li>
              </ul>
            </div>
          )}

          {/* Modal Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-surface-800">
            <Link
              to="/privacy"
              onClick={() => setShowPrivacyModal(false)}
              className="btn-secondary !py-1.5 !px-3 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Dedicated Policy Page
            </Link>
            <button
              onClick={() => setShowPrivacyModal(false)}
              className="btn-primary !py-1.5 !px-4 text-xs"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

