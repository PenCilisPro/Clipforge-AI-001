import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  set,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { TikTokIcon, YoutubeIcon } from '@/components/icons'
import { supabase, invokeFunction } from '@/lib/supabase'
import type { Clip, Platform, ScheduledPost } from '@/lib/types'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from '@/components/ui'

type ViewMode = 'month' | 'week' | 'day'

function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  return platform === 'youtube' ? (
    <YoutubeIcon className={className} />
  ) : (
    <TikTokIcon className={className} />
  )
}

interface PostWithClip extends ScheduledPost {
  clip: Clip | null
}

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(new Date())
  const [posts, setPosts] = useState<PostWithClip[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null)
  const [editingPost, setEditingPost] = useState<PostWithClip | null>(null)
  const [dragPostId, setDragPostId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [postsRes, clipsRes] = await Promise.all([
        supabase.from('scheduled_posts').select('*').order('scheduled_at', { ascending: true }),
        supabase
          .from('clips')
          .select('*')
          .eq('approved', true)
          .order('created_at', { ascending: false }),
      ])
      if (postsRes.error) throw new Error(postsRes.error.message)
      if (clipsRes.error) throw new Error(clipsRes.error.message)
      const clipList = (clipsRes.data ?? []) as Clip[]
      const clipMap = new Map(clipList.map((c) => [c.id, c]))
      let postClips = clipMap
      const postRows = (postsRes.data ?? []) as ScheduledPost[]
      const missingClipIds = postRows
        .map((p) => p.clip_id)
        .filter((id) => !clipMap.has(id))
      if (missingClipIds.length > 0) {
        const { data: extraClips } = await supabase
          .from('clips')
          .select('*')
          .in('id', missingClipIds)
        postClips = new Map([
          ...clipMap,
          ...((extraClips ?? []) as Clip[]).map((c) => [c.id, c] as const),
        ])
      }
      setPosts(postRows.map((p) => ({ ...p, clip: postClips.get(p.clip_id) ?? null })))
      setClips(clipList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const days = useMemo(() => {
    if (view === 'day') return [cursor]
    if (view === 'week') {
      return eachDayOfInterval({
        start: startOfWeek(cursor, { weekStartsOn: 1 }),
        end: endOfWeek(cursor, { weekStartsOn: 1 }),
      })
    }
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
    })
  }, [view, cursor])

  function navigate(direction: 1 | -1) {
    if (view === 'month') setCursor((c) => addMonths(c, direction))
    else if (view === 'week') setCursor((c) => addWeeks(c, direction))
    else setCursor((c) => addDays(c, direction))
  }

  async function moveToDay(postId: string, day: Date) {
    const post = posts.find((p) => p.id === postId)
    if (!post) return
    if (post.status === 'PUBLISHED' || post.status === 'UPLOADING') {
      setActionError('Published or uploading posts cannot be rescheduled.')
      return
    }
    const prev = parseISO(post.scheduled_at)
    const next = set(day, {
      hours: prev.getHours(),
      minutes: prev.getMinutes(),
      seconds: 0,
      milliseconds: 0,
    })
    setActionError(null)
    const { error: updateError } = await supabase
      .from('scheduled_posts')
      .update({ scheduled_at: next.toISOString() })
      .eq('id', postId)
    if (updateError) {
      setActionError(updateError.message)
      return
    }
    await load()
  }

  async function retryPost(post: PostWithClip) {
    setActionError(null)
    const { error: updateError } = await supabase
      .from('scheduled_posts')
      .update({
        status: 'RETRYING',
        error_message: null,
        retry_count: post.retry_count + 1,
      })
      .eq('id', post.id)
    if (updateError) {
      setActionError(updateError.message)
      return
    }
    await invokeFunction('publish-post', { postId: post.id }).catch(() => {
      // The publish queue also picks up RETRYING posts.
    })
    await load()
  }

  const queue = posts.filter((p) =>
    ['SCHEDULED', 'UPLOADING', 'FAILED', 'RETRYING'].includes(p.status),
  )

  if (loading) return <LoadingState label="Loading calendar..." />
  if (error) return <ErrorState message={error} onRetry={() => void load()} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Calendar"
        subtitle="Schedule and manage publishing across YouTube Shorts and TikTok."
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setEditingPost(null)
              setScheduleDate(new Date())
              setScheduleOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> Schedule Post
          </button>
        }
      />

      {actionError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {actionError}
        </div>
      )}

      <div className="card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button className="btn-ghost p-2" onClick={() => navigate(-1)} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="btn-ghost p-2" onClick={() => navigate(1)} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button className="btn-secondary text-xs" onClick={() => setCursor(new Date())}>
              Today
            </button>
            <h2 className="ml-2 text-lg font-semibold text-white">
              {view === 'day'
                ? format(cursor, 'EEEE, MMMM d, yyyy')
                : format(cursor, 'MMMM yyyy')}
            </h2>
          </div>
          <div className="flex rounded-lg border border-surface-500 p-0.5">
            {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
                  view === mode ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {view !== 'day' && (
          <div className="grid grid-cols-7 border-b border-surface-500 pb-2 text-center text-xs font-medium text-gray-500">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
        )}

        <div
          className={
            view === 'day'
              ? 'mt-2'
              : `mt-1 grid grid-cols-7 gap-1 ${view === 'week' ? '' : 'auto-rows-fr'}`
          }
        >
          {days.map((day) => {
            const dayPosts = posts.filter((p) => isSameDay(parseISO(p.scheduled_at), day))
            const isToday = isSameDay(day, new Date())
            const inMonth = view !== 'month' || isSameMonth(day, cursor)
            return (
              <div
                key={day.toISOString()}
                onDragOver={(e) => {
                  if (dragPostId) e.preventDefault()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragPostId) void moveToDay(dragPostId, day)
                  setDragPostId(null)
                }}
                onDoubleClick={() => {
                  setEditingPost(null)
                  setScheduleDate(day)
                  setScheduleOpen(true)
                }}
                className={`min-h-[92px] rounded-lg border p-1.5 transition ${
                  isToday ? 'border-brand-500/60' : 'border-surface-500'
                } ${inMonth ? 'bg-surface-800' : 'bg-surface-900 opacity-50'} ${
                  view === 'day' ? 'min-h-[400px]' : ''
                }`}
              >
                <div
                  className={`mb-1 text-right text-xs font-medium ${
                    isToday ? 'text-brand-400' : 'text-gray-500'
                  }`}
                >
                  {format(day, 'd')}
                </div>
                <div className="space-y-1">
                  {dayPosts.map((post) => (
                    <button
                      key={post.id}
                      draggable={post.status !== 'PUBLISHED' && post.status !== 'UPLOADING'}
                      onDragStart={() => setDragPostId(post.id)}
                      onDragEnd={() => setDragPostId(null)}
                      onClick={() => {
                        setEditingPost(post)
                        setScheduleDate(parseISO(post.scheduled_at))
                        setScheduleOpen(true)
                      }}
                      className="flex w-full items-center gap-1.5 rounded-md bg-surface-700 px-1.5 py-1 text-left text-xs hover:bg-surface-600"
                    >
                      {post.clip?.current_thumbnail_url ? (
                        <img
                          src={post.clip.current_thumbnail_url}
                          alt=""
                          className="h-6 w-4 shrink-0 rounded-sm object-cover"
                        />
                      ) : (
                        <PlatformIcon
                          platform={post.platform}
                          className="h-3.5 w-3.5 shrink-0 text-gray-400"
                        />
                      )}
                      <span className="truncate text-gray-200">{post.title}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-gray-500">
                        {format(parseISO(post.scheduled_at), 'HH:mm')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
          <Clock className="h-5 w-5 text-brand-400" /> Publishing Queue
        </h2>
        {queue.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-8 w-8" />}
            title="Queue is empty"
            message="Scheduled posts waiting to publish will appear here."
          />
        ) : (
          <div className="space-y-2">
            {queue.map((post) => (
              <div
                key={post.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-surface-500 bg-surface-800 px-3 py-2"
              >
                {post.clip?.current_thumbnail_url && (
                  <img
                    src={post.clip.current_thumbnail_url}
                    alt=""
                    className="h-12 w-8 rounded object-cover"
                  />
                )}
                <PlatformIcon platform={post.platform} className="h-4 w-4 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{post.title}</p>
                  <p className="text-xs text-gray-500">
                    {format(parseISO(post.scheduled_at), 'MMM d, yyyy HH:mm')}
                    {post.retry_count > 0 && ` · ${post.retry_count} retries`}
                  </p>
                  {post.error_message && (
                    <p className="mt-0.5 truncate text-xs text-red-400">{post.error_message}</p>
                  )}
                </div>
                <StatusBadge status={post.status} />
                {(post.status === 'FAILED' || post.status === 'RETRYING') && (
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => void retryPost(post)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Retry
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {scheduleOpen && (
        <SchedulePostModal
          clips={clips}
          post={editingPost}
          initialDate={scheduleDate ?? new Date()}
          onClose={() => setScheduleOpen(false)}
          onSaved={() => {
            setScheduleOpen(false)
            void load()
          }}
        />
      )}
    </div>
  )
}

function SchedulePostModal({
  clips,
  post,
  initialDate,
  onClose,
  onSaved,
}: {
  clips: Clip[]
  post: PostWithClip | null
  initialDate: Date
  onClose: () => void
  onSaved: () => void
}) {
  const [clipId, setClipId] = useState(post?.clip_id ?? clips[0]?.id ?? '')
  const [platform, setPlatform] = useState<Platform>(post?.platform ?? 'youtube')
  const [title, setTitle] = useState(post?.title ?? '')
  const [description, setDescription] = useState(post?.description ?? '')
  const [hashtags, setHashtags] = useState(post?.hashtags.join(' ') ?? '')
  const [visibility, setVisibility] = useState(post?.visibility ?? 'public')
  const [date, setDate] = useState(format(initialDate, 'yyyy-MM-dd'))
  const [time, setTime] = useState(
    post ? format(parseISO(post.scheduled_at), 'HH:mm') : '12:00',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const readOnly = post?.status === 'PUBLISHED' || post?.status === 'UPLOADING'

  useEffect(() => {
    if (!post && clipId) {
      const clip = clips.find((c) => c.id === clipId)
      if (clip && !title) setTitle(clip.title)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString()
      const tags = hashtags
        .split(/[\s,]+/)
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean)
      if (post) {
        const { error: updateError } = await supabase
          .from('scheduled_posts')
          .update({
            platform,
            title,
            description: description || null,
            hashtags: tags,
            visibility,
            scheduled_at: scheduledAt,
          })
          .eq('id', post.id)
        if (updateError) throw new Error(updateError.message)
      } else {
        if (!clipId) throw new Error('Select an approved clip to schedule.')
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) throw new Error('Not authenticated.')
        const { error: insertError } = await supabase.from('scheduled_posts').insert({
          clip_id: clipId,
          user_id: userData.user.id,
          platform,
          title: title || 'Untitled post',
          description: description || null,
          hashtags: tags,
          visibility,
          scheduled_at: scheduledAt,
          status: 'SCHEDULED',
        })
        if (insertError) throw new Error(insertError.message)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save post.')
    } finally {
      setSaving(false)
    }
  }

  async function deletePost() {
    if (!post) return
    setSaving(true)
    setError(null)
    const { error: deleteError } = await supabase
      .from('scheduled_posts')
      .delete()
      .eq('id', post.id)
    setSaving(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    onSaved()
  }

  return (
    <Modal open title={post ? 'Edit Scheduled Post' : 'Schedule Post'} onClose={onClose}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}
        {!post && (
          <div>
            <label className="label">Approved Clip</label>
            {clips.length === 0 ? (
              <p className="text-sm text-gray-500">
                No approved clips yet. Approve a rendered clip first.
              </p>
            ) : (
              <select className="input" value={clipId} onChange={(e) => setClipId(e.target.value)}>
                {clips.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Platform</label>
            <select
              className="input"
              value={platform}
              disabled={readOnly}
              onChange={(e) => setPlatform(e.target.value as Platform)}
            >
              <option value="youtube">YouTube Shorts</option>
              <option value="tiktok">TikTok</option>
            </select>
          </div>
          <div>
            <label className="label">Visibility</label>
            <select
              className="input"
              value={visibility}
              disabled={readOnly}
              onChange={(e) =>
                setVisibility(e.target.value as 'public' | 'unlisted' | 'private')
              }
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            value={title}
            disabled={readOnly}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Post title"
          />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            className="input min-h-[72px]"
            value={description}
            disabled={readOnly}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Post description"
          />
        </div>
        <div>
          <label className="label">Hashtags</label>
          <input
            className="input"
            value={hashtags}
            disabled={readOnly}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="#shorts #viral"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              value={date}
              disabled={readOnly}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Time</label>
            <input
              type="time"
              className="input"
              value={time}
              disabled={readOnly}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          {post && !readOnly ? (
            <button className="btn-ghost text-red-400" onClick={() => void deletePost()}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            {!readOnly && (
              <button
                className="btn-primary"
                disabled={saving || (!post && clips.length === 0)}
                onClick={() => void save()}
              >
                {saving ? 'Saving...' : post ? 'Save Changes' : 'Schedule'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
