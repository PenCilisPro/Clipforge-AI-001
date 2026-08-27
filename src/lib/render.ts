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

export async function createRenderJob(clip: Clip, version: ClipVersion): Promise<RenderJob> {
  const { data: existing } = await supabase
    .from('render_jobs')
    .select('*')
    .eq('clip_id', clip.id)
    .eq('clip_version_id', version.id)
    .in('status', ACTIVE_RENDER_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return existing as RenderJob

  const { data, error } = await supabase
    .from('render_jobs')
    .insert({
      clip_id: clip.id,
      clip_version_id: version.id,
      status: 'QUEUED',
      progress: 0,
      stage: 'QUEUED',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  await supabase
    .from('clips')
    .update({ status: 'RENDERING' })
    .eq('id', clip.id)

  return data as RenderJob
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
