import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clapperboard, Download, Film, FolderOpen, Image, Music, Play, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { BrollAsset, Clip, MusicTrack, Project, Video } from '@/lib/types'
import { formatDuration, formatFileSize } from '@/lib/format'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui'

type MediaTab = 'sources' | 'renders' | 'broll' | 'music'

const TABS: Array<{ id: MediaTab; label: string; icon: typeof Film }> = [
  { id: 'sources', label: 'Source Videos', icon: Film },
  { id: 'renders', label: 'Rendered Clips', icon: Clapperboard },
  { id: 'broll', label: 'B-Roll', icon: Image },
  { id: 'music', label: 'Music', icon: Music },
]

export default function MediaLibrary() {
  const [tab, setTab] = useState<MediaTab>('sources')
  const [videos, setVideos] = useState<Video[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [broll, setBroll] = useState<BrollAsset[]>([])
  const [music, setMusic] = useState<MusicTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [videosRes, projectsRes, clipsRes, brollRes, musicRes] = await Promise.all([
        supabase.from('videos').select('*').order('created_at', { ascending: false }),
        supabase.from('projects').select('*'),
        supabase
          .from('clips')
          .select('*')
          .not('current_render_url', 'is', null)
          .order('created_at', { ascending: false }),
        supabase.from('broll_assets').select('*').order('created_at', { ascending: false }),
        supabase.from('music_tracks').select('*').order('created_at', { ascending: false }),
      ])
      for (const res of [videosRes, projectsRes, clipsRes, brollRes, musicRes]) {
        if (res.error) throw new Error(res.error.message)
      }
      setVideos((videosRes.data ?? []) as Video[])
      setProjects((projectsRes.data ?? []) as Project[])
      setClips((clipsRes.data ?? []) as Clip[])
      setBroll((brollRes.data ?? []) as BrollAsset[])
      setMusic((musicRes.data ?? []) as MusicTrack[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media library.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const projectNames = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  )

  if (loading) return <LoadingState label="Loading media library..." />
  if (error) return <ErrorState message={error} onRetry={() => void load()} />

  const counts: Record<MediaTab, number> = {
    sources: videos.length,
    renders: clips.length,
    broll: broll.length,
    music: music.length,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Media Library"
        subtitle="All source videos, rendered clips, B-roll, and music in one place."
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              tab === id
                ? 'bg-brand-500 text-white'
                : 'bg-surface-800 text-gray-400 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            <span className="rounded-full bg-black/20 px-1.5 text-xs">{counts[id]}</span>
          </button>
        ))}
      </div>

      {tab === 'sources' &&
        (videos.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="h-8 w-8" />}
            title="No source videos"
            message="Create a project from a YouTube URL or upload to add source videos."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((video) => (
              <div key={video.id} className="card overflow-hidden">
                <div className="relative aspect-video bg-surface-700">
                  {video.thumbnail_url ? (
                    <img
                      src={video.thumbnail_url}
                      alt={video.title ?? 'Source video'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-zinc-600">
                      <Film className="h-8 w-8" />
                    </div>
                  )}
                  {video.duration != null && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                      {formatDuration(video.duration)}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium text-white">
                    {video.title ?? 'Untitled video'}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {projectNames.get(video.project_id) ?? 'Unknown project'} ·{' '}
                    {formatFileSize(video.file_size)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ))}

      {tab === 'renders' &&
        (clips.length === 0 ? (
          <EmptyState
            icon={<Clapperboard className="h-8 w-8" />}
            title="No rendered clips"
            message="Rendered MP4s will appear here once clips finish rendering."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {clips.map((clip) => (
              <div key={clip.id} className="card overflow-hidden">
                <div className="relative aspect-[9/16] bg-surface-700">
                  {clip.current_thumbnail_url ? (
                    <img
                      src={clip.current_thumbnail_url}
                      alt={clip.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-zinc-600">
                      <Clapperboard className="h-8 w-8" />
                    </div>
                  )}
                  <button
                    onClick={() =>
                      clip.current_render_url &&
                      setPreview({ url: clip.current_render_url, title: clip.title })
                    }
                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition hover:opacity-100"
                  >
                    <Play className="h-10 w-10 text-white" />
                  </button>
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                    {formatDuration(clip.duration)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <p className="min-w-0 truncate text-sm font-medium text-white">{clip.title}</p>
                  {clip.current_render_url && (
                    <a
                      href={clip.current_render_url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="text-gray-500 hover:text-white"
                      aria-label={`Download ${clip.title}`}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}

      {tab === 'broll' &&
        (broll.length === 0 ? (
          <EmptyState
            icon={<Image className="h-8 w-8" />}
            title="No B-roll assets"
            message="B-roll added to clips from Pexels, Pixabay, or Coverr will appear here."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {broll.map((asset) => (
              <div key={asset.id} className="card overflow-hidden">
                <div className="relative aspect-video bg-surface-700">
                  {asset.preview_image_url ? (
                    <img
                      src={asset.preview_image_url}
                      alt={asset.search_query ?? 'B-roll'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-zinc-600">
                      <Image className="h-8 w-8" />
                    </div>
                  )}
                  <button
                    onClick={() =>
                      setPreview({ url: asset.video_url, title: asset.search_query ?? 'B-roll' })
                    }
                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition hover:opacity-100"
                  >
                    <Play className="h-8 w-8 text-white" />
                  </button>
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium text-white">
                    {asset.search_query ?? 'B-roll clip'}
                  </p>
                  <p className="mt-0.5 text-xs uppercase text-gray-500">{asset.provider}</p>
                </div>
              </div>
            ))}
          </div>
        ))}

      {tab === 'music' &&
        (music.length === 0 ? (
          <EmptyState
            icon={<Music className="h-8 w-8" />}
            title="No music tracks"
            message="Music selected from Jamendo for your clips will appear here."
          />
        ) : (
          <div className="space-y-2">
            {music.map((track) => (
              <div
                key={track.id}
                className="card flex flex-wrap items-center gap-4 px-4 py-3"
              >
                <Music className="h-5 w-5 shrink-0 text-brand-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{track.title}</p>
                  <p className="text-xs text-gray-500">
                    {track.artist ?? 'Unknown artist'} ·{' '}
                    {track.duration != null ? formatDuration(track.duration) : '—'} · vol{' '}
                    {Math.round(track.volume * 100)}%
                  </p>
                </div>
                <audio controls preload="none" src={track.audio_url} className="h-8 max-w-[240px]" />
              </div>
            ))}
          </div>
        ))}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative max-h-full w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreview(null)}
              className="absolute -top-10 right-0 text-gray-400 hover:text-white"
              aria-label="Close preview"
            >
              <X className="h-6 w-6" />
            </button>
            <video
              src={preview.url}
              controls
              autoPlay
              className="max-h-[80vh] w-full rounded-xl bg-black"
            />
            <p className="mt-2 text-center text-sm text-gray-300">{preview.title}</p>
          </div>
        </div>
      )}
    </div>
  )
}
