import { useEffect, useState } from 'react'
import { Film } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Clip } from '@/lib/types'
import { PageHeader, EmptyState, LoadingState, Modal } from '@/components/ui'
import ClipCard from '@/components/ClipCard'

type Filter = 'all' | 'approved' | 'rendered' | 'pending'

export default function Clips() {
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [previewClip, setPreviewClip] = useState<Clip | null>(null)

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
        title="Clips"
        subtitle={`${clips.length} clip${clips.length === 1 ? '' : 's'} across all projects`}
        actions={
          <select
            className="input !w-auto"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            <option value="all">All clips</option>
            <option value="approved">Approved</option>
            <option value="rendered">Rendered</option>
            <option value="pending">Pending approval</option>
          </select>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Film className="h-10 w-10" />}
          title="No clips"
          message="Your AI-generated clips will appear here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              onApprove={(c) => void approveClip(c)}
              onPreview={setPreviewClip}
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(previewClip)}
        onClose={() => setPreviewClip(null)}
        title={previewClip?.title ?? ''}
      >
        {previewClip?.current_render_url && (
          <video
            src={previewClip.current_render_url}
            controls
            autoPlay
            className="mx-auto max-h-[70vh] rounded-lg"
          />
        )}
      </Modal>
    </div>
  )
}
