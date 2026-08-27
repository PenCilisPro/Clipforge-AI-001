import 'dotenv/config'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import type { ClipConfiguration, BrollConfigItem } from './src/types'

const exec = promisify(execFile)
const env = (name: string, optional = false) => {
  const value = process.env[name]?.trim()
  if (!value && !optional) throw new Error(`Missing required environment variable: ${name}`)
  return value || ''
}

const SUPABASE_URL = env('SUPABASE_URL')
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')
const FFMPEG = env('FFMPEG_PATH', true) || 'ffmpeg'
const FFPROBE = env('FFPROBE_PATH', true) || 'ffprobe'
const YTDLP = env('YTDLP_PATH', true) || 'yt-dlp'
const RAPID_KEY = env('RAPIDAPI_KEY', true) || env('VITE_RAPIDAPI_KEY', true)
const RAPID_HOST = env('RAPIDAPI_HOST', true) || 'youtube-media-downloader.p.rapidapi.com'
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

type Job = { id: string; clip_id: string; clip_version_id: string }
type Broll = BrollConfigItem & { file: string }

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const n = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const esc = (value: string) => value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/%/g, '\\%').replace(/\n/g, ' ')

async function jobUpdate(id: string, fields: Record<string, unknown>) {
  const { error } = await supabase.from('render_jobs').update(fields).eq('id', id)
  if (error) console.error(`[FFmpeg] job ${id} update failed: ${error.message}`)
}

async function download(url: string, file: string) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length) throw new Error('empty download')
  await writeFile(file, bytes)
}

async function signedSource(storagePath: string) {
  const { data, error } = await supabase.storage.from('sources').createSignedUrl(storagePath, 21600)
  if (error || !data?.signedUrl) throw new Error(error?.message || 'unable to sign source')
  return data.signedUrl
}

async function getSource(projectId: string, sourceType: string, sourceUrl: string | null, work: string) {
  const output = path.join(work, 'source.mp4')
  const { data: video } = await supabase.from('videos').select('storage_path').eq('project_id', projectId).maybeSingle()
  const storage = typeof video?.storage_path === 'string' ? video.storage_path.trim() : ''
  if (storage.startsWith('projects/')) {
    await download(await signedSource(storage), output)
    return output
  }
  if (sourceType !== 'youtube' || !sourceUrl) throw new Error('No usable source video found')

  if (RAPID_KEY) {
    try {
      const response = await fetch(`https://${RAPID_HOST}/v2/video/download?url=${encodeURIComponent(sourceUrl)}`, {
        headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST },
      })
      if (response.ok) {
        const type = response.headers.get('content-type') || ''
        if (!type.includes('json')) {
          await writeFile(output, Buffer.from(await response.arrayBuffer()))
        } else {
          const data: any = await response.json()
          const candidate = [data?.downloadUrl, data?.download_url, data?.url, data?.link, data?.data?.downloadUrl, data?.data?.download_url, data?.data?.url, ...(Array.isArray(data?.data) ? data.data.map((x: any) => x?.url || x?.downloadUrl || x?.download_url) : [])].find((x: unknown) => typeof x === 'string' && x.length)
          if (candidate) await download(String(candidate), output)
        }
      }
    } catch (error) {
      console.warn(`[FFmpeg] RapidAPI source download failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (!existsSync(output) || (await readFile(output)).length === 0) {
    const template = `${output}.%(ext)s`
    await exec(YTDLP, ['--no-playlist', '--no-warnings', '--format', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4', '--output', template, sourceUrl], { maxBuffer: 20 * 1024 * 1024 })
    const actual = [`${output}.mp4`, `${output}.webm`, `${output}.mkv`].find(existsSync)
    if (!actual) throw new Error('yt-dlp produced no source video')
    if (actual !== output) await writeFile(output, await readFile(actual))
  }

  const storagePath = `projects/${projectId}/source/source.mp4`
  const { error: uploadError } = await supabase.storage.from('sources').upload(storagePath, await readFile(output), { contentType: 'video/mp4', upsert: true })
  if (!uploadError) await supabase.from('videos').update({ storage_path: storagePath, file_size: (await readFile(output)).length }).eq('project_id', projectId)
  return output
}

async function downloadBroll(config: ClipConfiguration, work: string): Promise<Broll[]> {
  const ready: Broll[] = []
  for (let i = 0; i < (config.broll || []).length; i++) {
    const item = config.broll[i]
    if (!/^https?:\/\//i.test(item.videoUrl || '')) continue
    const file = path.join(work, `broll-${i}.mp4`)
    try {
      await download(item.videoUrl, file)
      const probe = await exec(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', file])
      if (probe.stdout.trim() !== 'video') throw new Error('asset has no video stream')
      ready.push({ ...item, file })
      console.log(`[FFmpeg] B-roll ${i + 1} validated`)
    } catch (error) {
      console.warn(`[FFmpeg] B-roll ${i + 1} skipped: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return ready
}

async function optionalMedia(url: string | null | undefined, work: string, name: string) {
  if (!url || !/^https?:\/\//i.test(url)) return null
  const file = path.join(work, name)
  try { await download(url, file); return file } catch (error) { console.warn(`[FFmpeg] ${name} skipped: ${error instanceof Error ? error.message : String(error)}`); return null }
}

function makeVideoFilter(config: ClipConfiguration, broll: Broll[], width: number, height: number) {
  const crop = config.crop || { mode: 'center', x: 0.5, y: 0.5, scale: 1 }
  const scale = Math.max(1, n(crop.scale, 1))
  const cropW = Math.max(2, Math.round(width / scale))
  const cropH = Math.max(2, Math.round(height / scale))
  const x = crop.mode === 'manual' || crop.mode === 'smart' ? `iw*${Math.min(1, Math.max(0, n(crop.x, 0.5)))}-${cropW}/2` : '(iw-ow)/2'
  const y = crop.mode === 'manual' || crop.mode === 'smart' ? `ih*${Math.min(1, Math.max(0, n(crop.y, 0.5)))}-${cropH}/2` : '(ih-oh)/2'
  const filters = [`[0:v]scale=${Math.max(width, cropW)}:${Math.max(height, cropH)}:force_original_aspect_ratio=increase,crop=${cropW}:${cropH}:max(0\,min(iw-ow\,${x})):max(0\,min(ih-oh\,${y})),scale=${width}:${height},setpts=PTS-STARTPTS[base]`]
  let current = '[base]'
  broll.forEach((item, i) => {
    const start = Math.max(0, n(item.startAt))
    const end = start + Math.max(0.05, n(item.duration, 3))
    filters.push(`[${i + 1}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setpts=PTS-STARTPTS[b${i}]`)
    const next = `[v${i}]`
    filters.push(`${current}[b${i}]overlay=0:0:eof_action=pass:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'${next}`)
    current = next
  })
  if (config.captions?.enabled) {
    for (const word of config.captions.words || []) {
      const text = String(word.text || '').trim()
      if (!text) continue
      const start = Math.max(0, n(word.start))
      const end = Math.max(start + 0.05, n(word.end))
      const style = config.captions.style
      const yPos = style.position === 'top' ? 'h*0.12' : style.position === 'center' ? '(h-text_h)/2' : 'h*0.78'
      const next = `[cap${filters.length}]`
      filters.push(`${current}drawtext=text='${esc(text)}':font='${esc(style.font || 'Arial')}':fontsize=${Math.max(18, n(style.fontSize, 64))}:fontcolor=${style.textColor || 'white'}:bordercolor=${style.strokeColor || 'black'}:borderw=${Math.max(0, n(style.strokeWidth, 6))}:x=(w-text_w)/2:y=${yPos}:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'${next}`)
      current = next
    }
  }
  for (const overlay of config.overlays || []) {
    const text = String(overlay.text || '').trim(); if (!text) continue
    const start = Math.max(0, n(overlay.startAt)); const end = start + Math.max(0.05, n(overlay.duration, 3))
    const y = overlay.position === 'top' ? 'h*0.08' : overlay.position === 'center' ? '(h-text_h)/2' : 'h*0.9'
    const next = `[ov${filters.length}]`
    filters.push(`${current}drawtext=text='${esc(text)}':fontsize=48:fontcolor=${overlay.color || 'white'}:bordercolor=black:borderw=4:x=(w-text_w)/2:y=${y}:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'${next}`)
    current = next
  }
  if (config.branding?.watermarkText) {
    const next = `[wm${filters.length}]`
    filters.push(`${current}drawtext=text='${esc(config.branding.watermarkText)}':fontsize=28:fontcolor=white@0.75:x=w-text_w-30:y=h-text_h-30${next}`)
    current = next
  }
  return { filters: filters.join(';'), video: current }
}

async function render(config: ClipConfiguration, source: string, broll: Broll[], music: string | null, voice: string | null, out: string) {
  const width = Math.max(240, Math.round(n(config.resolution?.width, 1080)))
  const height = Math.max(240, Math.round(n(config.resolution?.height, 1920)))
  const start = Math.max(0, n(config.startTime))
  const duration = Math.max(0.1, n(config.endTime, start + 30) - start)
  const inputs = ['-ss', String(start), '-t', String(duration), '-i', source]
  for (const item of broll) inputs.push('-stream_loop', '-1', '-i', item.file)
  if (music) inputs.push('-stream_loop', '-1', '-i', music)
  if (voice) inputs.push('-i', voice)
  const graph = makeVideoFilter(config, broll, width, height)
  const audioInputs = ['[0:a]']
  if (music) audioInputs.push(`[${1 + broll.length}:a]`)
  if (voice) audioInputs.push(`[${1 + broll.length + (music ? 1 : 0)}:a]`)
  const filters = [graph.filters]
  let audio = '[aout]'
  if (audioInputs.length > 1) {
    filters.push(`${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=first:dropout_transition=2[aout]`)
  } else {
    filters.push(`[0:a]volume=${Math.max(0, n(config.originalVolume, 1))}[aout]`)
  }
  const args = ['-y', ...inputs, '-filter_complex', filters.join(';'), '-map', graph.video, '-map', audio, '-c:v', 'libx264', '-preset', env('FFMPEG_PRESET', true) || 'veryfast', '-crf', env('FFMPEG_CRF', true) || '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', String(duration), out]
  await exec(FFMPEG, args, { maxBuffer: 30 * 1024 * 1024 })
}

async function process(job: Job) {
  const work = path.join(os.tmpdir(), `clipforge-render-${job.id}`)
  await rm(work, { recursive: true, force: true }); await mkdir(work, { recursive: true })
  try {
    await jobUpdate(job.id, { status: 'RENDERING', stage: 'LOADING_SOURCE', progress: 5, started_at: new Date().toISOString(), error_message: null })
    const { data: version, error: ve } = await supabase.from('clip_versions').select('id,version_number,configuration_json').eq('id', job.clip_version_id).single()
    if (ve || !version) throw new Error(ve?.message || 'clip version not found')
    const { data: clip, error: ce } = await supabase.from('clips').select('id,project_id').eq('id', job.clip_id).single()
    if (ce || !clip) throw new Error(ce?.message || 'clip not found')
    const { data: project, error: pe } = await supabase.from('projects').select('id,source_type,source_url').eq('id', clip.project_id).single()
    if (pe || !project) throw new Error(pe?.message || 'project not found')
    const config = version.configuration_json as ClipConfiguration
    const source = await getSource(project.id, project.source_type, project.source_url, work)
    await jobUpdate(job.id, { stage: 'DOWNLOADING_BROLL', progress: 15 })
    const broll = await downloadBroll(config, work)
    const music = await optionalMedia(config.music?.audioUrl, work, 'music.bin')
    const voice = await optionalMedia(config.voiceUrl, work, 'voice.bin')
    await jobUpdate(job.id, { stage: 'FFMPEG_EDITING', progress: 25 })
    const output = path.join(work, 'finished.mp4')
    await render(config, source, broll, music, voice, output)
    await jobUpdate(job.id, { stage: 'VALIDATING', progress: 88 })
    const probe = await exec(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type,duration,width,height', '-of', 'json', output])
    const metadata = JSON.parse(probe.stdout || '{}')
    if (!metadata.streams?.some((stream: any) => stream.codec_type === 'video')) throw new Error('finished MP4 has no video stream')
    await jobUpdate(job.id, { stage: 'UPLOADING_RENDER', progress: 93 })
    const key = `projects/${project.id}/renders/${clip.id}-v${version.version_number}.mp4`
    const { error: uploadError } = await supabase.storage.from('renders').upload(key, await readFile(output), { contentType: 'video/mp4', upsert: true })
    if (uploadError) throw new Error(`Render upload failed: ${uploadError.message}`)
    const renderUrl = supabase.storage.from('renders').getPublicUrl(key).data.publicUrl
    const thumb = path.join(work, 'thumbnail.jpg')
    let thumbnailUrl: string | null = null
    try {
      await exec(FFMPEG, ['-y', '-i', output, '-frames:v', '1', '-q:v', '2', thumb])
      const thumbKey = `projects/${project.id}/renders/${clip.id}-v${version.version_number}.jpg`
      const { error } = await supabase.storage.from('renders').upload(thumbKey, await readFile(thumb), { contentType: 'image/jpeg', upsert: true })
      if (!error) thumbnailUrl = supabase.storage.from('renders').getPublicUrl(thumbKey).data.publicUrl
    } catch (error) { console.warn(`[FFmpeg] thumbnail failed: ${error instanceof Error ? error.message : String(error)}`) }
    const { error: versionUpdate } = await supabase.from('clip_versions').update({ render_url: renderUrl, thumbnail_url: thumbnailUrl, status: 'COMPLETED' }).eq('id', version.id)
    if (versionUpdate) throw new Error(`Version update failed: ${versionUpdate.message}`)
    const { error: clipUpdate } = await supabase.from('clips').update({ current_version_id: version.id, current_render_url: renderUrl, current_thumbnail_url: thumbnailUrl, status: 'RENDERED' }).eq('id', clip.id)
    if (clipUpdate) throw new Error(`Clip update failed: ${clipUpdate.message}`)
    await jobUpdate(job.id, { status: 'COMPLETED', stage: 'COMPLETED', progress: 100, completed_at: new Date().toISOString(), error_message: null })
    console.log(`[FFmpeg] COMPLETE ${clip.id}: ${renderUrl}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[FFmpeg] Job ${job.id} failed: ${message}`)
    await jobUpdate(job.id, { status: 'FAILED', stage: 'FAILED', error_message: message })
  } finally { await rm(work, { recursive: true, force: true }).catch(() => undefined) }
}

async function main() {
  await exec(FFMPEG, ['-version'], { maxBuffer: 2 * 1024 * 1024 })
  await exec(FFPROBE, ['-version'], { maxBuffer: 2 * 1024 * 1024 })
  console.log('========================================')
  console.log('ClipForge FFmpeg worker V2 active.')
  console.log('Waiting for QUEUED render jobs...')
  console.log('========================================')
  for (;;) {
    const { data, error } = await supabase.from('render_jobs').select('id,clip_id,clip_version_id').eq('status', 'QUEUED').order('created_at', { ascending: true }).limit(1)
    if (error) { console.error(`[FFmpeg] queue error: ${error.message}`); await sleep(3000); continue }
    const job = data?.[0] as Job | undefined
    if (!job) { await sleep(2000); continue }
    const { data: claimed, error: claimError } = await supabase.from('render_jobs').update({ status: 'CLAIMED', stage: 'CLAIMED', progress: 1 }).eq('id', job.id).eq('status', 'QUEUED').select('id').maybeSingle()
    if (claimError || !claimed) continue
    await process(job)
  }
}

main().catch(error => { console.error('[FFmpeg] Worker stopped:', error); process.exit(1) })
