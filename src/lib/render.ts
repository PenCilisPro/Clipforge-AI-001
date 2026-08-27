import { supabase } from '@/lib/supabase'
import type { Clip, ClipConfiguration, ClipVersion, RenderJob } from '@/lib/types'

const ACTIVE_RENDER_STATUSES = ['QUEUED', 'PREPARING', 'RENDERING', 'UPLOADING']

export async function saveConfigurationAsVersion(
  clip: Clip,
  config: ClipConfiguration,
): Promise<ClipVersion> {
  const { data: latest } = await supabase
    .from('clip_versions')
    .select('version_number')
    .eq('clip_id', clip.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersion = ((latest as { version_number: number } | null)?.version_number ?? 0) + 1

  const { data, error } = await supabase
    .from('clip_versions')
    .insert({
      clip_id: clip.id,
      version_number: nextVersion,
      configuration_json: config,
      status: 'QUEUED',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as ClipVersion
}

/**
 * Rendering is automatic after project creation. Cloud Export must never be
 * the mechanism that starts a render. This function only returns an already
 * queued/active render job so legacy callers cannot create duplicate jobs.
 */
export async function createRenderJob(clip: Clip, version: ClipVersion): Promise<RenderJob> {
  const { data: existing, error } = await supabase
    .from('render_jobs')
    .select('*')
    .eq('clip_id', clip.id)
    .eq('clip_version_id', version.id)
    .in('status', [...ACTIVE_RENDER_STATUSES, 'COMPLETED'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (existing) return existing as RenderJob

  throw new Error('Rendering is automatic. This project has not been queued by the background worker yet.')
}

export async function restoreVersion(clip: Clip, version: ClipVersion): Promise<void> {
  const { error } = await supabase
    .from('clips')
    .update({
      current_version_id: version.id,
      current_render_url: version.render_url,
      current_thumbnail_url: version.thumbnail_url,
    })
    .eq('id', clip.id)

  if (error) throw new Error(error.message)
}
