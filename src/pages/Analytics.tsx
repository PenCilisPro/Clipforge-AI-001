import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, TrendingUp } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { AnalyticsRecord, Clip, ScheduledPost } from '@/lib/types'
import { formatCount } from '@/lib/format'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ScoreBadge,
  StatCard,
  StatusBadge,
} from '@/components/ui'

const BRAND = '#f97316'
const CHART_GRID = '#2a2a32'

interface PostAnalytics {
  post: ScheduledPost
  clip: Clip | null
  latest: AnalyticsRecord | null
}

export default function Analytics() {
  const [records, setRecords] = useState<AnalyticsRecord[]>([])
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [analyticsRes, postsRes, clipsRes] = await Promise.all([
        supabase.from('analytics').select('*').order('recorded_at', { ascending: false }),
        supabase.from('scheduled_posts').select('*'),
        supabase.from('clips').select('*'),
      ])
      if (analyticsRes.error) throw new Error(analyticsRes.error.message)
      if (postsRes.error) throw new Error(postsRes.error.message)
      if (clipsRes.error) throw new Error(clipsRes.error.message)
      setRecords((analyticsRes.data ?? []) as AnalyticsRecord[])
      setPosts((postsRes.data ?? []) as ScheduledPost[])
      setClips((clipsRes.data ?? []) as Clip[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const postAnalytics = useMemo<PostAnalytics[]>(() => {
    const clipMap = new Map(clips.map((c) => [c.id, c]))
    const latestByPost = new Map<string, AnalyticsRecord>()
    for (const record of records) {
      // records are ordered newest first
      if (!latestByPost.has(record.scheduled_post_id)) {
        latestByPost.set(record.scheduled_post_id, record)
      }
    }
    return posts.map((post) => ({
      post,
      clip: clipMap.get(post.clip_id) ?? null,
      latest: latestByPost.get(post.id) ?? null,
    }))
  }, [records, posts, clips])

  const published = postAnalytics.filter((p) => p.post.status === 'PUBLISHED')

  const totals = useMemo(() => {
    let views = 0
    let likes = 0
    let comments = 0
    let shares = 0
    for (const { latest } of published) {
      if (!latest) continue
      views += latest.views
      likes += latest.likes
      comments += latest.comments
      shares += latest.shares
    }
    const interactions = likes + comments + shares
    const engagementRate = views > 0 ? (interactions / views) * 100 : 0
    return { views, likes, comments, shares, engagementRate }
  }, [published])

  const platformData = useMemo(() => {
    const byPlatform = new Map<string, { views: number; likes: number; posts: number }>()
    for (const { post, latest } of published) {
      const entry = byPlatform.get(post.platform) ?? { views: 0, likes: 0, posts: 0 }
      entry.posts += 1
      if (latest) {
        entry.views += latest.views
        entry.likes += latest.likes
      }
      byPlatform.set(post.platform, entry)
    }
    return [...byPlatform.entries()].map(([platform, data]) => ({
      platform: platform === 'youtube' ? 'YouTube Shorts' : 'TikTok',
      ...data,
    }))
  }, [published])

  const patternData = useMemo(() => {
    const byPattern = new Map<
      string,
      { views: number; engagement: number; posts: number; score: number }
    >()
    for (const { post, clip, latest } of published) {
      if (!clip?.matched_pattern_name) continue
      const entry = byPattern.get(clip.matched_pattern_name) ?? {
        views: 0,
        engagement: 0,
        posts: 0,
        score: 0,
      }
      entry.posts += 1
      entry.score = Math.max(entry.score, clip.pattern_score)
      if (latest) {
        entry.views += latest.views
        entry.engagement += latest.engagement_rate
      }
      byPattern.set(clip.matched_pattern_name, entry)
      void post
    }
    return [...byPattern.entries()]
      .map(([pattern, data]) => ({
        pattern,
        views: data.views,
        posts: data.posts,
        avgEngagement: data.posts > 0 ? data.engagement / data.posts : 0,
      }))
      .sort((a, b) => b.views - a.views)
  }, [published])

  const topClips = useMemo(
    () =>
      [...published]
        .filter((p) => p.latest)
        .sort((a, b) => (b.latest?.views ?? 0) - (a.latest?.views ?? 0))
        .slice(0, 8),
    [published],
  )

  const publishingStats = useMemo(() => {
    const counts = { PUBLISHED: 0, FAILED: 0, SCHEDULED: 0, other: 0 }
    for (const { post } of postAnalytics) {
      if (post.status === 'PUBLISHED') counts.PUBLISHED += 1
      else if (post.status === 'FAILED') counts.FAILED += 1
      else if (post.status === 'SCHEDULED') counts.SCHEDULED += 1
      else counts.other += 1
    }
    return counts
  }, [postAnalytics])

  if (loading) return <LoadingState label="Loading analytics..." />
  if (error) return <ErrorState message={error} onRetry={() => void load()} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        subtitle="Performance across platforms with pattern feedback for better clips."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total Views" value={formatCount(totals.views)} />
        <StatCard label="Likes" value={formatCount(totals.likes)} />
        <StatCard label="Comments" value={formatCount(totals.comments)} />
        <StatCard label="Shares" value={formatCount(totals.shares)} />
        <StatCard
          label="Engagement Rate"
          value={`${totals.engagementRate.toFixed(1)}%`}
          hint="interactions / views"
        />
      </div>

      {published.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-8 w-8" />}
          title="No analytics yet"
          message="Analytics appear after posts are published and platform data is synced."
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
                Platform Performance
              </h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={platformData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis dataKey="platform" stroke="#71717a" fontSize={12} />
                  <YAxis stroke="#71717a" fontSize={12} tickFormatter={formatCount} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #2a2a32',
                      borderRadius: 8,
                    }}
                  />
                  <Legend />
                  <Bar dataKey="views" fill={BRAND} name="Views" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="likes" fill="#fdba74" name="Likes" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-4">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
                Pattern Performance
              </h2>
              {patternData.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-500">
                  No pattern-matched published clips yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={patternData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis type="number" stroke="#71717a" fontSize={12} tickFormatter={formatCount} />
                    <YAxis
                      type="category"
                      dataKey="pattern"
                      stroke="#71717a"
                      fontSize={12}
                      width={120}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid #2a2a32',
                        borderRadius: 8,
                      }}
                    />
                    <Bar dataKey="views" name="Views" radius={[0, 4, 4, 0]}>
                      {patternData.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? BRAND : '#9a3412'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
              <TrendingUp className="h-5 w-5 text-brand-400" /> Top Clips
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-500 text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4">Clip</th>
                    <th className="py-2 pr-4">Platform</th>
                    <th className="py-2 pr-4">Published</th>
                    <th className="py-2 pr-4">Score</th>
                    <th className="py-2 pr-4">Pattern</th>
                    <th className="py-2 pr-4 text-right">Views</th>
                    <th className="py-2 pr-4 text-right">Likes</th>
                    <th className="py-2 text-right">Engagement</th>
                  </tr>
                </thead>
                <tbody>
                  {topClips.map(({ post, clip, latest }) => (
                    <tr key={post.id} className="border-b border-surface-600/50">
                      <td className="max-w-[220px] truncate py-2 pr-4 font-medium text-white">
                        {post.title}
                      </td>
                      <td className="py-2 pr-4 capitalize text-gray-400">{post.platform}</td>
                      <td className="py-2 pr-4 text-gray-400">
                        {post.published_at
                          ? format(parseISO(post.published_at), 'MMM d, yyyy')
                          : '—'}
                      </td>
                      <td className="py-2 pr-4">
                        {clip ? <ScoreBadge score={clip.score} size="sm" /> : '—'}
                      </td>
                      <td className="py-2 pr-4 text-gray-400">
                        {clip?.matched_pattern_name ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-white">
                        {formatCount(latest?.views)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-gray-300">
                        {formatCount(latest?.likes)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-300">
                        {latest ? `${latest.engagement_rate.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Publishing Performance
        </h2>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <StatusBadge status="PUBLISHED" />
            <span className="text-lg font-bold tabular-nums text-white">
              {publishingStats.PUBLISHED}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status="SCHEDULED" />
            <span className="text-lg font-bold tabular-nums text-white">
              {publishingStats.SCHEDULED}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status="FAILED" />
            <span className="text-lg font-bold tabular-nums text-white">
              {publishingStats.FAILED}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Success rate:{' '}
            {publishingStats.PUBLISHED + publishingStats.FAILED > 0
              ? `${Math.round(
                  (publishingStats.PUBLISHED /
                    (publishingStats.PUBLISHED + publishingStats.FAILED)) *
                    100,
                )}%`
              : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}
