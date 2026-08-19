import { Link } from 'react-router-dom'
import { Film, Play, Pencil, CheckCircle2 } from 'lucide-react'
import type { Clip } from '@/lib/types'
import { formatDuration } from '@/lib/format'
import { StatusBadge, ScoreBadge } from '@/components/ui'

export default function ClipCard({
  clip,
  onApprove,
  onPreview,
}: {
  clip: Clip
  onApprove?: (clip: Clip) => void
  onPreview?: (clip: Clip) => void
}) {
  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-[9/16] max-h-64 w-full bg-surface-850">
        {clip.current_thumbnail_url ? (
          <img
            src={clip.current_thumbnail_url}
            alt={clip.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <Film className="h-8 w-8" />
          </div>
        )}
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium">
          {formatDuration(clip.duration)}
        </span>
        {clip.current_render_url && onPreview && (
          <button
            onClick={() => onPreview(clip)}
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100"
          >
            <Play className="h-10 w-10 text-white" />
          </button>
        )}
      </div>

      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold">{clip.title}</h3>
          <ScoreBadge score={clip.score} />
        </div>

        {clip.matched_pattern_name && (
          <p className="text-xs text-zinc-400">
            Matched Pattern: <span className="text-brand-400">{clip.matched_pattern_name}</span>{' '}
            · {Math.round(clip.pattern_score)}%
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={clip.status} />
          {clip.approved && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Approved
            </span>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Link to={`/clips/${clip.id}/studio`} className="btn-secondary flex-1 !py-1.5 text-xs">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Link>
          {onApprove && !clip.approved && (
            <button
              onClick={() => onApprove(clip)}
              className="btn-primary flex-1 !py-1.5 text-xs"
              disabled={!clip.current_render_url}
              title={clip.current_render_url ? undefined : 'Render the clip before approving'}
            >
              Approve
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
