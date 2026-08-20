import { Link } from 'react-router-dom'
import { Film, Play, Pencil, CheckCircle2, Sparkles } from 'lucide-react'
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
    <div className="card overflow-hidden transition-all duration-200 hover:border-surface-650 hover:shadow-lg">
      <div className="relative aspect-[9/16] max-h-64 w-full bg-surface-850 group cursor-pointer" onClick={() => onPreview && onPreview(clip)}>
        {clip.current_thumbnail_url ? (
          <img
            src={clip.current_thumbnail_url}
            alt={clip.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <Film className="h-8 w-8" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />
        
        <span className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-surface-900/80 px-2 py-0.5 text-[11px] font-medium text-brand-400 backdrop-blur-sm border border-brand-500/20">
          <Sparkles className="h-3 w-3" /> Remotion Clip
        </span>

        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium backdrop-blur-sm">
          {formatDuration(clip.duration)}
        </span>

        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/90 text-white shadow-xl backdrop-blur-sm transition-transform group-hover:scale-110">
            <Play className="h-6 w-6 fill-white ml-0.5" />
          </div>
        </div>
      </div>

      <div className="space-y-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{clip.title}</h3>
          <ScoreBadge score={clip.score} />
        </div>

        {clip.hook && (
          <p className="line-clamp-1 text-xs italic text-zinc-400">
            &ldquo;{clip.hook}&rdquo;
          </p>
        )}

        {clip.matched_pattern_name && (
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <span>Pattern:</span>
            <span className="font-medium text-brand-400 truncate">{clip.matched_pattern_name}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-surface-800">
          <StatusBadge status={clip.status} />
          {clip.approved && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Approved
            </span>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onPreview && onPreview(clip)}
            className="btn-secondary flex-1 !py-1.5 text-xs"
          >
            <Play className="h-3.5 w-3.5 text-brand-400" /> Remotion
          </button>
          <Link to={`/clips/${clip.id}/studio`} className="btn-secondary flex-1 !py-1.5 text-xs">
            <Pencil className="h-3.5 w-3.5" /> Studio
          </Link>
          {onApprove && !clip.approved && (
            <button
              onClick={() => onApprove(clip)}
              className="btn-primary !py-1.5 !px-2.5 text-xs"
              title="Approve clip"
            >
              Approve
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
