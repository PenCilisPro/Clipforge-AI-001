import { useEffect, useState } from 'react'
import { Sparkles, Brain, Waypoints, Gauge } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Clip, Project } from '@/lib/types'
import { PageHeader, StatCard, LoadingState, ScoreBadge } from '@/components/ui'
import { Link } from 'react-router-dom'

const PIPELINE_STAGES = [
  'Source Video',
  'AI Analysis',
  'Transcription',
  'Pattern Engine',
  'Clip Detection',
  'Clip Configuration',
  'Remotion Rendering',
  'Captions',
  'B-roll',
  'Music',
  '9:16 Final Video',
  'Preview & Approval',
  'Calendar',
  'Auto Publishing',
  'Analytics',
]

export default function AIPage() {
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    void (async () => {
      const [c, p] = await Promise.all([
        supabase.from('clips').select('*').order('score', { ascending: false }),
        supabase.from('projects').select('*'),
      ])
      setClips((c.data as Clip[]) ?? [])
      setProjects((p.data as Project[]) ?? [])
    })()
  }, [])

  if (!clips) return <LoadingState />

  const avg = (fn: (c: Clip) => number) =>
    clips.length === 0 ? 0 : clips.reduce((s, c) => s + fn(c), 0) / clips.length

  return (
    <div>
      <PageHeader
        title="AI Engine"
        subtitle="How ClipForge analyzes, scores, and assembles your clips"
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Clips Analyzed" value={String(clips.length)} />
        <StatCard label="Avg Overall Score" value={avg((c) => c.score).toFixed(0)} />
        <StatCard label="Avg Hook Score" value={avg((c) => c.hook_score).toFixed(0)} />
        <StatCard label="Avg Pattern Match" value={`${avg((c) => c.pattern_score).toFixed(0)}%`} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            <Waypoints className="h-4 w-4 text-brand-400" /> Processing Pipeline
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={stage} className="flex items-center gap-2">
                <span className="rounded-lg bg-surface-800 px-2.5 py-1 text-xs font-medium text-zinc-300">
                  {stage}
                </span>
                {i < PIPELINE_STAGES.length - 1 && <span className="text-zinc-600">→</span>}
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            <Brain className="h-4 w-4 text-brand-400" /> What the AI analyzes
          </h2>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {[
              'Strong hooks',
              'Strong statements',
              'Questions',
              'Stories',
              'Controversial opinions',
              'Emotional moments',
              'Surprising information',
              'Educational moments',
              'Humor',
              'Reactions',
              'Topic changes',
              'Tone changes',
              'Pauses',
              'Context',
              'Retention potential',
              'Shareability',
            ].map((item) => (
              <span key={item} className="rounded-full bg-surface-800 px-2.5 py-1 text-zinc-400">
                {item}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          <Gauge className="h-4 w-4 text-brand-400" /> Highest Scored Clips
        </h2>
        {clips.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Your AI-generated clips will appear here.{' '}
            <Link to="/create" className="text-brand-400 hover:underline">
              Create a project
            </Link>{' '}
            to get started.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {clips.slice(0, 6).map((clip) => (
              <Link
                key={clip.id}
                to={`/clips/${clip.id}/studio`}
                className="rounded-lg border border-surface-700 p-4 transition-colors hover:border-brand-500/50"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{clip.title}</p>
                  <div className="flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                    <ScoreBadge score={clip.score} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-zinc-500">
                  <span>Hook: {Math.round(clip.hook_score)}</span>
                  <span>Engagement: {Math.round(clip.engagement_score)}</span>
                  <span>Completeness: {Math.round(clip.completeness_score)}</span>
                  <span>Pattern: {Math.round(clip.pattern_score)}</span>
                  <span>Emotional: {Math.round(clip.emotional_score)}</span>
                  <span>Shareability: {Math.round(clip.shareability_score)}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-400">
                  {projects.find((p) => p.id === clip.project_id)?.name}
                  {clip.matched_pattern_name && (
                    <>
                      {' · '}
                      <span className="text-brand-400">{clip.matched_pattern_name}</span>
                    </>
                  )}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
