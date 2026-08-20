import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Film, Sparkles, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Clip, ClipConfiguration } from '@/lib/types'
import { defaultClipConfiguration } from '@/lib/types'
import { PageHeader, EmptyState, LoadingState, Modal, ScoreBadge } from '@/components/ui'
import ClipCard from '@/components/ClipCard'
import { RemotionPlayerPreview } from '@/components/remotion/RemotionPlayerPreview'
import { formatDuration } from '@/lib/format'

type Filter = 'all' | 'approved' | 'rendered' | 'pending'

export default function Clips() {
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [previewClip, setPreviewClip] = useState<Clip | null>(null)
  const [previewConfig, setPreviewConfig] = useState<ClipConfiguration | null>(null)
  const [previewTab, setPreviewTab] = useState<'remotion' | 'mp4'>('remotion')

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    const { data } = await supabase
      .from('clips')
      .select('*')
      .order('score', { ascending: false })
    setClips((data as Clip[]) ?? [])
  }

  async function approveClip(clip: Clip) {
    await supabase.from('clips').update({ approved: true, status: 'APPROVED' }).eq('id', clip.id)
    await load()
  }

  async function handleOpenPreview(clip: Clip) {
    setPreviewClip(clip)
    setPreviewTab(clip.current_render_url ? 'mp4' : 'remotion')

    // Fetch the version config if available
    const { data: versionData } = await supabase
      .from('clip_versions')
      .select('configuration_json')
      .eq('clip_id', clip.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (versionData?.configuration_json && Object.keys(versionData.configuration_json).length > 0) {
      const cfg = versionData.configuration_json as any
      const merged = defaultClipConfiguration(
        cfg.sourceVideo || clip.current_thumbnail_url || '',
        clip.start_time || 0,
        clip.end_time || 30,
      )
      setPreviewConfig({ ...merged, ...cfg })
    } else {
      setPreviewConfig(
        defaultClipConfiguration(
          clip.current_thumbnail_url || '',
          clip.start_time || 0,
          clip.end_time || 30,
        ),
      )
    }
  }

  if (!clips) return <LoadingState />

  const filtered = clips.filter((c) => {
    if (filter === 'approved') return c.approved
    if (filter === 'rendered') return Boolean(c.current_render_url)
    if (filter === 'pending') return !c.approved
    return true
  })

  return (
    <div>
      <PageHeader
        title="Remotion Clips"
        subtitle={`${clips.length} clip${clips.length === 1 ? '' : 's'} clipped & timed by Remotion engine`}
        actions={
          <div className="flex items-center gap-2">
            <select
              className="input !w-auto"
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
            >
              <option value="all">All clips ({clips.length})</option>
              <option value="approved">Approved</option>
              <option value="rendered">Rendered MP4s</option>
              <option value="pending">Pending approval</option>
            </select>
          </div>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Film className="h-10 w-10 text-brand-400" />}
          title="No clips found"
          message="Create a project to have Remotion analyze and clip viral moments for you."
          action={
            <Link to="/create" className="btn-primary">
              <Sparkles className="h-4 w-4" /> Create New Project
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              onApprove={(c) => void approveClip(c)}
              onPreview={(c) => void handleOpenPreview(c)}
            />
          ))}
        </div>
      )}

      {/* Remotion Live Composition Preview Modal */}
      <Modal
        open={Boolean(previewClip)}
        onClose={() => {
          setPreviewClip(null)
          setPreviewConfig(null)
        }}
        title={previewClip?.title ?? 'Clip Preview'}
      >
        {previewClip && (
          <div className="space-y-4">
            {/* Tab switcher */}
            <div className="flex items-center justify-between border-b border-surface-700 pb-3">
              <div className="flex rounded-lg bg-surface-800 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewTab('remotion')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                    previewTab === 'remotion'
                      ? 'bg-brand-500 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Remotion Live Player
                </button>
                {previewClip.current_render_url && (
                  <button
                    type="button"
                    onClick={() => setPreviewTab('mp4')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                      previewTab === 'mp4'
                        ? 'bg-brand-500 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Film className="h-3.5 w-3.5" /> Rendered MP4
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <ScoreBadge score={previewClip.score} />
                <span className="text-xs text-zinc-400 font-mono">
                  {formatDuration(previewClip.duration)}
                </span>
              </div>
            </div>

            {/* Video / Remotion container */}
            <div className="flex justify-center py-2">
              {previewTab === 'remotion' && previewConfig ? (
                <div className="w-full max-w-[280px]">
                  <RemotionPlayerPreview config={previewConfig} />
                </div>
              ) : previewClip.current_render_url ? (
                <video
                  src={previewClip.current_render_url}
                  controls
                  autoPlay
                  className="aspect-[9/16] w-full max-w-[280px] rounded-xl bg-black object-contain shadow-2xl"
                />
              ) : (
                previewConfig && (
                  <div className="w-full max-w-[280px]">
                    <RemotionPlayerPreview config={previewConfig} />
                  </div>
                )
              )}
            </div>

            {/* Metadata & Actions */}
            <div className="rounded-lg bg-surface-850 p-3 text-xs space-y-2">
              {previewClip.hook && (
                <p className="text-zinc-300">
                  <span className="font-semibold text-brand-400">Viral Hook:</span> &ldquo;{previewClip.hook}&rdquo;
                </p>
              )}
              {previewClip.matched_pattern_name && (
                <p className="text-zinc-400">
                  <span className="font-semibold text-zinc-300">Pattern:</span> {previewClip.matched_pattern_name}
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Link
                to={`/clips/${previewClip.id}/studio`}
                className="btn-primary flex-1 justify-center !py-2 text-xs"
                onClick={() => setPreviewClip(null)}
              >
                <Pencil className="h-4 w-4" /> Open in Remotion Clip Studio
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
