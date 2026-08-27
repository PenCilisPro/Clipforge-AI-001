import 'dotenv/config'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { bundle } from '@remotion/bundler'
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer'
import type { EditPlan, BrollItem } from './src/types'

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const SUPABASE_URL = required('SUPABASE_URL')
const SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
let serveUrl: string | null = null

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function updateJob(id: string, fields: Record<string, unknown>) {
  const { error } = await supabase.from('render_jobs').update(fields).eq('id', id)
  if (error) console.error(`[Remotion] job ${id} update failed: ${error.message}`)
}

async function syncProjectProgress(projectId: string) {
  const { data: clips, error: clipError } = await supabase.from('clips').select('id').eq('project_id', projectId)
  if (clipError || !clips?.length) return

  const { data: jobs, error } = await supabase
    .from('render_jobs')
    .select('status,progress,error_message')
    .in('clip_id', clips.map((c) => c.id))

  if (error || !jobs?.length) return

  const total = jobs.length
  const completed = jobs.filter((j) => j.status === 'COMPLETED').length
  const failed = jobs.filter((j) => j.status === 'FAILED').length
  const avg = jobs.reduce((sum, j) => sum + Number(j.progress || 0), 0) / total

  if (failed > 0) {
    await supabase.from('projects').update({
      status: 'FAILED',
      progress: Math.round(avg),
      error_message: `${failed} clip render job(s) failed.`,
      updated_at: new Date().toISOString(),
    }).eq('id', projectId)
    return
  }

  if (completed === total) {
    await supabase.from('projects').update({
      status: 'COMPLETED',
      progress: 100,
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', projectId)
    return
  }

  await supabase.from('projects').update({
    status: 'RENDERING',
    progress: Math.max(90, Math.min(99, Math.round(avg))),
    error_message: null,
    updated_at: new Date().toISOString(),
  }).eq('id', projectId)
}

async function download(url: string, destination: string) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`HTTP ${response.status} while downloading asset`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length) throw new Error('Downloaded asset is empty')
  await writeFile(destination, bytes)
}

async function resolveSource(source: string, workDir: string) {
  if (!source?.trim()) throw new Error('Edit plan has no sourceVideo')
  if (source.startsWith('projects/')) {
    const { data, error } = await supabase.storage.from('sources').createSignedUrl(source, 6 * 60 * 60)
    if (error || !data?.signedUrl) throw new Error(error?.message || 'Unable to sign source video')
    const target = path.join(workDir, 'source.mp4')
    await download(data.signedUrl, target)
    return target
  }
  if (/^https?:\/\//i.test(source)) {
    const target = path.join(workDir, 'source.mp4')
    await download(source, target)
    return target
  }
  if (existsSync(source)) return source
  throw new Error(`Source video not found: ${source}`)
}

async function prepareBroll(items: BrollItem[], workDir: string, clipOffset: number) {
  const prepared: Array<BrollItem & { localUrl: string }> = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const url = item.videoUrl?.trim()
    if (!/^https?:\/\//i.test(url)) continue
    try {
      const localFile = path.join(workDir, `broll-${i}.mp4`)
      await download(url, localFile)
      const info = await stat(localFile)
      if (info.size < 1024) throw new Error('asset is empty or too small')
      prepared.push({ ...item, startAt: Math.max(0, item.startAt - clipOffset), localUrl: pathToFileURL(localFile).href })
    } catch (error) {
      console.warn(`[Remotion] B-roll ${i + 1} skipped: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return prepared
}

async function prepareMusic(plan: EditPlan, workDir: string) {
  const url = plan.music?.audioUrl?.trim()
  if (!url || !/^https?:\/\//i.test(url)) return null
  try {
    const file = path.join(workDir, 'music.mp3')
    await download(url, file)
    return pathToFileURL(file).href
  } catch (error) {
    console.warn(`[Remotion] Music skipped: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

async function renderJob(job: { id: string; clip_id: string; clip_version_id: string }) {
  const workDir = path.join(os.tmpdir(), `clipforge-remotion-${job.id}`)
  await rm(workDir, { recursive: true, force: true })
  await mkdir(workDir, { recursive: true })

  let projectId: string | null = null
  try {
    await updateJob(job.id, { status: 'PREPARING', stage: 'LOADING_PLAN', progress: 1, started_at: new Date().toISOString(), error_message: null })

    const { data: version, error: versionError } = await supabase.from('clip_versions').select('id,clip_id,version_number,configuration_json').eq('id', job.clip_version_id).single()
    if (versionError || !version) throw new Error(versionError?.message || 'Clip version not found')
    const { data: clip, error: clipError } = await supabase.from('clips').select('id,project_id').eq('id', job.clip_id).single()
    if (clipError || !clip) throw new Error(clipError?.message || 'Clip not found')
    projectId = clip.project_id

    const rawPlan = version.configuration_json as unknown as EditPlan
    const clipStart = Number(rawPlan.startTime ?? 0)
    const clipEnd = Number(rawPlan.endTime ?? clipStart + 30)

    await updateJob(job.id, { status: 'PREPARING', stage: 'DOWNLOADING_SOURCE', progress: 3 })
    const sourceFile = await resolveSource(rawPlan.sourceVideo, workDir)
    await updateJob(job.id, { status: 'PREPARING', stage: 'PREPARING_BROLL_MUSIC', progress: 5 })
    const broll = await prepareBroll(rawPlan.broll ?? [], workDir, clipStart)
    const music = await prepareMusic(rawPlan, workDir)

    const normalizedPlan: EditPlan = {
      ...rawPlan,
      sourceVideo: pathToFileURL(sourceFile).href,
      startTime: 0,
      endTime: Math.max(1, clipEnd - clipStart),
      resolution: rawPlan.resolution ?? { width: 1080, height: 1920 },
      broll: broll.map(({ localUrl, ...item }) => ({ ...item, videoUrl: localUrl })),
      music: music && rawPlan.music ? { ...rawPlan.music, audioUrl: music } : rawPlan.music ?? null,
    }

    if (!serveUrl) {
      await updateJob(job.id, { status: 'PREPARING', stage: 'BUNDLING_REMOTION', progress: 7 })
      serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') })
    }

    const composition = await selectComposition({ serveUrl, id: 'Clip', inputProps: { plan: normalizedPlan } })
    const outputPath = path.join(workDir, 'finished.mp4')
    await updateJob(job.id, { status: 'RENDERING', stage: 'REMOTION_RENDERING', progress: 10 })
    let lastReported = 10

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outputPath,
      concurrency: 1,
      inputProps: { plan: normalizedPlan },
      onProgress: ({ progress }) => {
        const pct = Math.min(90, Math.max(10, Math.round(10 + progress * 80)))
        if (pct - lastReported >= 2) {
          lastReported = pct
          void updateJob(job.id, { status: 'RENDERING', stage: 'REMOTION_RENDERING', progress: pct })
          if (projectId) void syncProjectProgress(projectId)
        }
      },
    })

    const outputInfo = await stat(outputPath)
    if (outputInfo.size < 1024) throw new Error('Remotion output is empty or too small')

    await updateJob(job.id, { status: 'UPLOADING', stage: 'UPLOADING_MP4', progress: 95 })
    if (projectId) await syncProjectProgress(projectId)
    const renderKey = `projects/${projectId}/renders/${clip.id}-v${version.version_number}.mp4`
    const { error: uploadError } = await supabase.storage.from('renders').upload(renderKey, await readFile(outputPath), { contentType: 'video/mp4', upsert: true })
    if (uploadError) throw new Error(`Render upload failed: ${uploadError.message}`)
    const renderUrl = supabase.storage.from('renders').getPublicUrl(renderKey).data.publicUrl

    let thumbnailUrl: string | null = null
    try {
      await updateJob(job.id, { status: 'UPLOADING', stage: 'GENERATING_THUMBNAIL', progress: 97 })
      const thumbnailPath = path.join(workDir, 'thumbnail.jpg')
      await renderStill({ composition, serveUrl, output: thumbnailPath, inputProps: { plan: normalizedPlan }, frame: 0, imageFormat: 'jpeg' })
      const key = `projects/${projectId}/thumbnails/${clip.id}-v${version.version_number}.jpg`
      const { error } = await supabase.storage.from('renders').upload(key, await readFile(thumbnailPath), { contentType: 'image/jpeg', upsert: true })
      if (!error) thumbnailUrl = supabase.storage.from('renders').getPublicUrl(key).data.publicUrl
    } catch (error) {
      console.warn(`[Remotion] thumbnail skipped: ${error instanceof Error ? error.message : String(error)}`)
    }

    const { error: versionUpdateError } = await supabase.from('clip_versions').update({ render_url: renderUrl, thumbnail_url: thumbnailUrl, status: 'COMPLETED' }).eq('id', version.id)
    if (versionUpdateError) throw new Error(`Version update failed: ${versionUpdateError.message}`)
    const { error: clipUpdateError } = await supabase.from('clips').update({ current_version_id: version.id, current_render_url: renderUrl, current_thumbnail_url: thumbnailUrl, status: 'RENDERED' }).eq('id', clip.id)
    if (clipUpdateError) throw new Error(`Clip update failed: ${clipUpdateError.message}`)

    await updateJob(job.id, { status: 'COMPLETED', stage: 'COMPLETED', progress: 100, completed_at: new Date().toISOString(), error_message: null })
    if (projectId) await syncProjectProgress(projectId)
    console.log(`[Remotion] completed ${job.id}: ${renderUrl}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[Remotion] job ${job.id} failed: ${message}`)
    await updateJob(job.id, { status: 'FAILED', stage: 'FAILED', error_message: message })
    if (projectId) await syncProjectProgress(projectId)
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function main() {
  console.log('========================================')
  console.log('ClipForge Remotion worker active.')
  console.log('Render jobs are created automatically after project processing.')
  console.log('Waiting for QUEUED render jobs...')
  console.log('========================================')

  while (true) {
    const { data: jobs, error } = await supabase.from('render_jobs').select('id,clip_id,clip_version_id').eq('status', 'QUEUED').order('created_at', { ascending: true }).limit(1)
    if (error) {
      console.error(`[Remotion] queue error: ${error.message}`)
      await sleep(3000)
      continue
    }
    const job = jobs?.[0] as { id: string; clip_id: string; clip_version_id: string } | undefined
    if (!job) {
      await sleep(2500)
      continue
    }
    const { data: claimed, error: claimError } = await supabase.from('render_jobs').update({ status: 'PREPARING', stage: 'CLAIMED', progress: 0 }).eq('id', job.id).eq('status', 'QUEUED').select('id').maybeSingle()
    if (claimError || !claimed) continue
    await renderJob(job)
  }
}

void main().catch((error) => {
  console.error('[Remotion] worker stopped:', error)
  process.exit(1)
})
