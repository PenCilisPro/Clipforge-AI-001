import { createClient } from '@supabase/supabase-js'
import type { EditPlan } from './src/types'

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const supabase = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

function normalizePlan(raw: any, sourcePath: string | null): EditPlan {
  const captions = raw?.captions ?? {}
  const music = raw?.music && typeof raw.music === 'object' ? raw.music : null
  const broll = Array.isArray(raw?.broll) ? raw.broll : []
  const endTime = Number(raw?.endTime ?? 30)
  const startTime = Number(raw?.startTime ?? 0)

  return {
    ...raw,
    sourceVideo: sourcePath || raw?.sourceVideo || '',
    startTime: Number.isFinite(startTime) ? startTime : 0,
    endTime: Number.isFinite(endTime) && endTime > startTime ? endTime : startTime + 30,
    aspectRatio: '9:16',
    resolution: raw?.resolution?.width && raw?.resolution?.height ? raw.resolution : { width: 1080, height: 1920 },
    speed: Number(raw?.speed) || 1,
    crop: raw?.crop || { mode: 'center', x: 0.5, y: 0.5, scale: 1 },
    captions: {
      enabled: captions.enabled !== false,
      style: captions.style || { font: 'Inter', fontSize: 64, weight: 800, position: 'bottom', textColor: '#FFFFFF', highlightColor: '#F97316', strokeColor: '#000000', strokeWidth: 6, animation: 'pop' },
      words: Array.isArray(captions.words) ? captions.words : [],
    },
    broll: broll.filter((x: any) => x && typeof x === 'object' && typeof x.videoUrl === 'string'),
    music,
    overlays: Array.isArray(raw?.overlays) ? raw.overlays : [],
    branding: raw?.branding || { logoUrl: null, watermarkText: null },
    originalVolume: Number(raw?.originalVolume ?? 1),
  }
}

export async function queueReadyProjects(): Promise<number> {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id,status')
    .in('status', ['QUEUED', 'DOWNLOADING', 'EXTRACTING_AUDIO', 'TRANSCRIBING', 'ANALYZING', 'MATCHING_PATTERNS', 'FINDING_CLIPS', 'GENERATING_CONFIG', 'RENDERING'])
    .order('created_at', { ascending: true })
    .limit(20)

  if (error) {
    console.error(`[Remotion] project queue query failed: ${error.message}`)
    return 0
  }

  let created = 0

  for (const project of projects || []) {
    const { data: clips } = await supabase.from('clips').select('id').eq('project_id', project.id)
    if (!clips?.length) continue

    const { data: video } = await supabase.from('videos').select('storage_path').eq('project_id', project.id).maybeSingle()
    const clipIds = clips.map((c) => c.id)
    const { data: versions } = await supabase.from('clip_versions').select('id,clip_id,configuration_json,version_number').in('clip_id', clipIds).order('version_number', { ascending: true })

    for (const version of versions || []) {
      const { data: existing } = await supabase.from('render_jobs').select('id,status').eq('clip_version_id', version.id).in('status', ['QUEUED', 'PREPARING', 'RENDERING', 'UPLOADING', 'COMPLETED']).limit(1).maybeSingle()
      if (existing) continue

      const plan = normalizePlan(version.configuration_json, video?.storage_path || null)
      if (!plan.sourceVideo) {
        console.warn(`[Remotion] project ${project.id}: clip version ${version.id} has no source video yet`)
        continue
      }

      const { error: configError } = await supabase.from('clip_versions').update({ configuration_json: plan, status: 'QUEUED' }).eq('id', version.id)
      if (configError) {
        console.error(`[Remotion] failed to normalize version ${version.id}: ${configError.message}`)
        continue
      }

      const { error: jobError } = await supabase.from('render_jobs').insert({
        clip_id: version.clip_id,
        clip_version_id: version.id,
        status: 'QUEUED',
        progress: 0,
        stage: 'QUEUED_FOR_REMOTION',
        error_message: null,
      })
      if (jobError) {
        console.error(`[Remotion] failed to queue version ${version.id}: ${jobError.message}`)
        continue
      }

      created += 1
      await supabase.from('clips').update({ status: 'RENDERING' }).eq('id', version.clip_id)
    }

    const { data: jobs } = await supabase.from('render_jobs').select('status,progress').in('clip_id', clipIds)
    if (jobs?.length) {
      const failed = jobs.some((j) => j.status === 'FAILED')
      const completed = jobs.filter((j) => j.status === 'COMPLETED').length
      const average = jobs.reduce((sum, j) => sum + Number(j.progress || 0), 0) / jobs.length
      await supabase.from('projects').update({
        status: failed ? 'FAILED' : completed === jobs.length ? 'COMPLETED' : 'RENDERING',
        progress: failed ? Math.round(average) : completed === jobs.length ? 100 : Math.max(90, Math.min(99, Math.round(average))),
        error_message: failed ? 'One or more clip render jobs failed.' : null,
        updated_at: new Date().toISOString(),
      }).eq('id', project.id)
    }
  }

  return created
}
