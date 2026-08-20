// ClipForge render worker.
//
// Polls Supabase for QUEUED render jobs, renders the clip with Remotion,
// uploads the MP4 + thumbnail to Supabase Storage, and updates the database.
//
// Required environment variables:
//   SUPABASE_URL              - project URL
//   SUPABASE_SERVICE_ROLE_KEY - service role key (server-side only)
//
// Run with: npm run worker

import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { bundle } from '@remotion/bundler'
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer'
import { createClient } from '@supabase/supabase-js'
import type { ClipConfiguration } from './src/types'

const DEFAULT_SUPABASE_URL = 'https://uenjzvbtwlawhpsybamnp.supabase.co'
const DEFAULT_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlbmp2YnR3bGF3aHBzeWJhbW5wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjUyNDY4NiwiZXhwIjoyMTAyMTAwNjg2fQ.HzeC8LX0acpGSfOMsBP8KVsMrOqNfRj3jG6abzBgwGg'

const SUPABASE_URL = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const POLL_INTERVAL_MS = 5000

interface RenderJobRow {
  id: string
  clip_id: string
  clip_version_id: string
  status: string
}

interface ClipVersionRow {
  id: string
  clip_id: string
  version_number: number
  configuration_json: ClipConfiguration
}

interface ClipRow {
  id: string
  project_id: string
}

let bundleLocation: string | null = null

async function getBundle(): Promise<string> {
  if (bundleLocation) return bundleLocation
  console.log('Bundling Remotion composition...')
  bundleLocation = await bundle({
    entryPoint: path.resolve('src/index.ts'),
  })
  return bundleLocation
}

async function updateJob(
  jobId: string,
  fields: {
    status?: string
    progress?: number
    stage?: string | null
    error_message?: string | null
    started_at?: string
    completed_at?: string
  },
): Promise<void> {
  const { error } = await supabase.from('render_jobs').update(fields).eq('id', jobId)
  if (error) console.error(`Failed to update job ${jobId}:`, error.message)
}

async function resolveSourceUrl(config: ClipConfiguration): Promise<string> {
  const src = config.sourceVideo
  if (src.startsWith('http://') || src.startsWith('https://')) return src
  // Storage path inside the private "sources" bucket.
  const { data, error } = await supabase.storage
    .from('sources')
    .createSignedUrl(src, 60 * 60 * 6)
  if (error || !data) {
    throw new Error(`Cannot sign source video URL for "${src}": ${error?.message}`)
  }
  return data.signedUrl
}

async function processJob(job: RenderJobRow): Promise<void> {
  console.log(`Processing render job ${job.id}...`)
  await updateJob(job.id, {
    status: 'RENDERING',
    stage: 'PREPARING',
    progress: 0,
    started_at: new Date().toISOString(),
    error_message: null,
  })
  await supabase
    .from('clip_versions')
    .update({ status: 'RENDERING' })
    .eq('id', job.clip_version_id)

  const workDir = mkdtempSync(path.join(tmpdir(), 'clipforge-render-'))
  try {
    const { data: versionData, error: versionError } = await supabase
      .from('clip_versions')
      .select('id, clip_id, version_number, configuration_json')
      .eq('id', job.clip_version_id)
      .single()
    if (versionError || !versionData) {
      throw new Error(`Cannot load clip version: ${versionError?.message}`)
    }
    const version = versionData as ClipVersionRow

    const { data: clipData, error: clipError } = await supabase
      .from('clips')
      .select('id, project_id')
      .eq('id', job.clip_id)
      .single()
    if (clipError || !clipData) {
      throw new Error(`Cannot load clip: ${clipError?.message}`)
    }
    const clip = clipData as ClipRow

    const config: ClipConfiguration = {
      ...version.configuration_json,
      sourceVideo: await resolveSourceUrl(version.configuration_json),
    }

    const serveUrl = await getBundle()
    const composition = await selectComposition({
      serveUrl,
      id: 'Clip',
      inputProps: { config },
    })

    await updateJob(job.id, { stage: 'RENDERING', progress: 5 })

    const outputPath = path.join(workDir, 'clip.mp4')
    let lastReported = 0
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: { config },
      onProgress: ({ progress }) => {
        const pct = Math.round(progress * 85) + 5
        if (pct - lastReported >= 5) {
          lastReported = pct
          void updateJob(job.id, { progress: pct })
        }
      },
    })

    await updateJob(job.id, { stage: 'THUMBNAIL', progress: 90 })
    const thumbnailPath = path.join(workDir, 'thumbnail.jpeg')
    await renderStill({
      composition,
      serveUrl,
      output: thumbnailPath,
      inputProps: { config },
      frame: Math.min(15, composition.durationInFrames - 1),
      imageFormat: 'jpeg',
    })

    await updateJob(job.id, { stage: 'UPLOADING_RENDER', progress: 92 })

    const renderKey = `projects/${clip.project_id}/renders/${clip.id}-v${version.version_number}.mp4`
    const { error: uploadError } = await supabase.storage
      .from('renders')
      .upload(renderKey, readFileSync(outputPath), {
        contentType: 'video/mp4',
        upsert: true,
      })
    if (uploadError) throw new Error(`Render upload failed: ${uploadError.message}`)

    const thumbKey = `projects/${clip.project_id}/thumbnails/${clip.id}-v${version.version_number}.jpeg`
    const { error: thumbError } = await supabase.storage
      .from('thumbnails')
      .upload(thumbKey, readFileSync(thumbnailPath), {
        contentType: 'image/jpeg',
        upsert: true,
      })
    if (thumbError) throw new Error(`Thumbnail upload failed: ${thumbError.message}`)

    const renderUrl = supabase.storage.from('renders').getPublicUrl(renderKey).data.publicUrl
    const thumbnailUrl = supabase.storage
      .from('thumbnails')
      .getPublicUrl(thumbKey).data.publicUrl

    const { error: versionUpdateError } = await supabase
      .from('clip_versions')
      .update({ render_url: renderUrl, thumbnail_url: thumbnailUrl, status: 'RENDERED' })
      .eq('id', version.id)
    if (versionUpdateError) {
      throw new Error(`Version update failed: ${versionUpdateError.message}`)
    }

    const { error: clipUpdateError } = await supabase
      .from('clips')
      .update({
        current_version_id: version.id,
        current_render_url: renderUrl,
        current_thumbnail_url: thumbnailUrl,
        status: 'RENDERED',
      })
      .eq('id', clip.id)
    if (clipUpdateError) throw new Error(`Clip update failed: ${clipUpdateError.message}`)

    await updateJob(job.id, {
      status: 'COMPLETED',
      stage: 'COMPLETED',
      progress: 100,
      completed_at: new Date().toISOString(),
    })
    console.log(`Render job ${job.id} completed: ${renderUrl}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Render job ${job.id} failed:`, message)
    await updateJob(job.id, {
      status: 'FAILED',
      error_message: message,
      completed_at: new Date().toISOString(),
    })
    await supabase
      .from('clip_versions')
      .update({ status: 'FAILED' })
      .eq('id', job.clip_version_id)
    await supabase.from('clips').update({ status: 'FAILED' }).eq('id', job.clip_id)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

async function claimNextJob(): Promise<RenderJobRow | null> {
  const { data, error } = await supabase
    .from('render_jobs')
    .select('id, clip_id, clip_version_id, status')
    .eq('status', 'QUEUED')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('Failed to poll render jobs:', error.message)
    return null
  }
  if (!data) return null

  // Optimistic claim: only one worker wins the QUEUED -> CLAIMED transition.
  const { data: claimed, error: claimError } = await supabase
    .from('render_jobs')
    .update({ status: 'CLAIMED' })
    .eq('id', data.id)
    .eq('status', 'QUEUED')
    .select('id, clip_id, clip_version_id, status')
    .maybeSingle()
  if (claimError || !claimed) return null
  return claimed as RenderJobRow
}

async function main(): Promise<void> {
  console.log('ClipForge render worker started. Polling for QUEUED render jobs...')
  for (;;) {
    try {
      const job = await claimNextJob()
      if (job) {
        await processJob(job)
        continue
      }
    } catch (err) {
      console.error('Worker loop error:', err)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

void main()
