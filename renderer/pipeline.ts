// ClipForge processing pipeline worker.
//
// Polls Supabase for projects in QUEUED status and runs the full pipeline:
// download source -> extract audio -> transcribe -> match patterns ->
// detect clips -> generate configurations -> queue render jobs.
//
// Required environment variables:
//   SUPABASE_URL              - project URL
//   SUPABASE_SERVICE_ROLE_KEY - service role key (server-side only)
//   OPENAI_API_KEY            - Whisper transcription + optional AI scoring
// Optional:
//   PEXELS_API_KEY            - automatic B-roll
//   JAMENDO_CLIENT_ID         - automatic music
//
// External binaries required on PATH: yt-dlp, ffmpeg, ffprobe.
//
// Run with: npm run pipeline

import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import type {
  BrollConfigItem,
  CaptionWordConfig,
  ClipConfiguration,
  MusicConfig,
} from './src/types'

const execFileAsync = promisify(execFile)

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const POLL_INTERVAL_MS = 5000

interface ProjectRow {
  id: string
  user_id: string
  name: string
  source_type: 'youtube' | 'upload'
  source_url: string | null
  status: string
  pattern_set_id: string | null
  clip_duration_preset: '15-30' | '30-60' | '60-90' | 'ai'
  max_clips: number
  auto_broll: boolean
  auto_music: boolean
  caption_preset: string
  ai_optimization: boolean
}

interface VideoRow {
  id: string
  project_id: string
  storage_path: string | null
  youtube_video_id: string | null
}

interface PatternRow {
  id: string
  name: string
  category: string
  start_signal: string
  end_signal: string
  score: number
  keywords: string[]
  is_active: boolean
}

interface Word {
  text: string
  start: number
  end: number
}

interface Segment {
  start: number
  end: number
  text: string
}

interface Candidate {
  start: number
  end: number
  title: string
  hook: string
  topic: string
  category: string
  patternId: string | null
  patternName: string | null
  patternScore: number
  hookScore: number
  engagementScore: number
  emotionalScore: number
  shareabilityScore: number
  completenessScore: number
  score: number
}

async function setStatus(
  projectId: string,
  status: string,
  progress: number,
  errorMessage: string | null = null,
): Promise<void> {
  console.log(`  [${projectId}] ${status} (${progress}%)`)
  await supabase
    .from('projects')
    .update({ status, progress, error_message: errorMessage })
    .eq('id', projectId)
}

async function downloadSource(project: ProjectRow, workDir: string): Promise<string> {
  const outPath = path.join(workDir, 'source.mp4')

  if (project.source_type === 'youtube') {
    if (!project.source_url) throw new Error('Project has no YouTube URL.')
    await setStatus(project.id, 'DOWNLOADING', 5)
    await execFileAsync(
      'yt-dlp',
      [
        '-f',
        'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format',
        'mp4',
        '-o',
        outPath,
        project.source_url,
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    )

    // Upload the source into storage so re-renders never re-download.
    const storagePath = `projects/${project.id}/source/source.mp4`
    const { error: uploadError } = await supabase.storage
      .from('sources')
      .upload(storagePath, readFileSync(outPath), {
        contentType: 'video/mp4',
        upsert: true,
      })
    if (uploadError) {
      console.warn(`  Source upload to storage failed: ${uploadError.message}`)
    } else {
      await supabase
        .from('videos')
        .update({ storage_path: storagePath, file_size: statSync(outPath).size })
        .eq('project_id', project.id)
    }
    return outPath
  }

  // Uploaded source: download from the private sources bucket.
  await setStatus(project.id, 'DOWNLOADING', 5)
  const { data: video } = await supabase
    .from('videos')
    .select('id, project_id, storage_path, youtube_video_id')
    .eq('project_id', project.id)
    .maybeSingle()
  const videoRow = video as VideoRow | null
  if (!videoRow?.storage_path) throw new Error('Uploaded source not found in storage.')
  const { data: signed, error: signError } = await supabase.storage
    .from('sources')
    .createSignedUrl(videoRow.storage_path, 3600)
  if (signError || !signed) throw new Error(`Cannot sign source URL: ${signError?.message}`)
  const res = await fetch(signed.signedUrl)
  if (!res.ok) throw new Error(`Source download failed: ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  writeFileSync(outPath, bytes)
  return outPath
}

async function probeVideo(
  filePath: string,
): Promise<{ duration: number; width: number; height: number }> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ])
  const info = JSON.parse(stdout) as {
    format: { duration: string }
    streams: Array<{ codec_type: string; width?: number; height?: number }>
  }
  const videoStream = info.streams.find((s) => s.codec_type === 'video')
  return {
    duration: Number(info.format.duration),
    width: videoStream?.width ?? 0,
    height: videoStream?.height ?? 0,
  }
}

async function extractAudio(projectId: string, videoPath: string, workDir: string): Promise<string> {
  await setStatus(projectId, 'EXTRACTING_AUDIO', 15)
  const audioPath = path.join(workDir, 'audio.mp3')
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    videoPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-b:a',
    '64k',
    audioPath,
  ])
  return audioPath
}

async function transcribe(
  projectId: string,
  audioPath: string,
): Promise<{ words: Word[]; segments: Segment[]; fullText: string; language: string }> {
  await setStatus(projectId, 'TRANSCRIBING', 25)
  if (!OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is not configured; transcription is required for clip detection.',
    )
  }

  const form = new FormData()
  const audioBuffer = readFileSync(audioPath)
  form.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'audio.mp3')
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  form.append('timestamp_granularities[]', 'segment')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Transcription failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as {
    text: string
    language: string
    words?: Array<{ word: string; start: number; end: number }>
    segments?: Array<{ start: number; end: number; text: string }>
  }
  return {
    fullText: data.text,
    language: data.language,
    words: (data.words ?? []).map((w) => ({ text: w.word.trim(), start: w.start, end: w.end })),
    segments: (data.segments ?? []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    })),
  }
}

function durationRange(preset: ProjectRow['clip_duration_preset']): [number, number] {
  switch (preset) {
    case '15-30':
      return [15, 30]
    case '30-60':
      return [30, 60]
    case '60-90':
      return [60, 90]
    default:
      return [15, 90]
  }
}

const HOOK_WORDS = [
  'secret',
  'never',
  'always',
  'mistake',
  'why',
  'how',
  'stop',
  'best',
  'worst',
  'truth',
  'nobody',
  'everyone',
  'crazy',
  'insane',
  'shocking',
  'important',
]

function heuristicCandidates(
  segments: Segment[],
  patterns: PatternRow[],
  preset: ProjectRow['clip_duration_preset'],
  maxClips: number,
): Candidate[] {
  const [minDur, maxDur] = durationRange(preset)
  const candidates: Candidate[] = []

  for (let i = 0; i < segments.length; i++) {
    const startSeg = segments[i]
    let end = startSeg.start
    let text = ''
    for (let j = i; j < segments.length; j++) {
      end = segments[j].end
      text += ` ${segments[j].text}`
      const dur = end - startSeg.start
      if (dur < minDur) continue
      if (dur > maxDur) break

      const lower = text.toLowerCase()
      let matched: PatternRow | null = null
      for (const p of patterns) {
        const signals = [p.start_signal, ...p.keywords].filter(Boolean)
        if (signals.some((s) => s && lower.includes(s.toLowerCase()))) {
          if (!matched || p.score > matched.score) matched = p
        }
      }

      const hookHits = HOOK_WORDS.filter((w) => lower.includes(w)).length
      const hasQuestion = /\?/.test(text)
      const endsCleanly = /[.!?]\s*$/.test(segments[j].text)
      const hookScore = Math.min(100, 50 + hookHits * 10 + (hasQuestion ? 10 : 0))
      const patternScore = matched ? matched.score : 40
      const engagementScore = Math.min(100, 45 + hookHits * 8 + (hasQuestion ? 12 : 0))
      const emotionalScore = Math.min(
        100,
        40 + (lower.match(/\b(love|hate|amazing|terrible|awesome|fear|excited)\b/g)?.length ?? 0) * 15,
      )
      const shareabilityScore = Math.min(100, (hookScore + engagementScore) / 2 + 5)
      const completenessScore = endsCleanly ? 85 : 55
      const score =
        hookScore * 0.25 +
        engagementScore * 0.2 +
        patternScore * 0.25 +
        emotionalScore * 0.1 +
        shareabilityScore * 0.1 +
        completenessScore * 0.1

      const firstSentence = startSeg.text.split(/[.!?]/)[0].trim()
      candidates.push({
        start: startSeg.start,
        end,
        title: firstSentence.slice(0, 80) || 'Untitled clip',
        hook: firstSentence.slice(0, 120),
        topic: matched?.category ?? 'General',
        category: matched?.category ?? 'General',
        patternId: matched?.id ?? null,
        patternName: matched?.name ?? null,
        patternScore,
        hookScore,
        engagementScore,
        emotionalScore,
        shareabilityScore,
        completenessScore,
        score,
      })
      break
    }
  }

  // Deduplicate overlapping candidates, keep highest score.
  candidates.sort((a, b) => b.score - a.score)
  const chosen: Candidate[] = []
  for (const c of candidates) {
    if (chosen.some((o) => Math.max(c.start, o.start) < Math.min(c.end, o.end))) continue
    chosen.push(c)
    if (chosen.length >= maxClips) break
  }
  return chosen
}

async function aiCandidates(
  fullText: string,
  segments: Segment[],
  patterns: PatternRow[],
  preset: ProjectRow['clip_duration_preset'],
  maxClips: number,
): Promise<Candidate[] | null> {
  if (!OPENAI_API_KEY) return null
  const [minDur, maxDur] = durationRange(preset)

  const segmentList = segments
    .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join('\n')
  const patternList = patterns
    .map((p) => `- id=${p.id} name="${p.name}" category="${p.category}" score=${p.score} startSignal="${p.start_signal}" keywords=${p.keywords.join(',')}`)
    .join('\n')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You find the best short-form clip candidates in a long-form video transcript. ' +
            'Clips must start at a natural sentence beginning with a strong hook and end with a satisfying conclusion. ' +
            `Each clip must be between ${minDur} and ${maxDur} seconds. ` +
            'Use the provided timestamped segments for boundaries. Respond with JSON: ' +
            '{"clips":[{"start":number,"end":number,"title":string,"hook":string,"topic":string,"category":string,' +
            '"patternId":string|null,"hookScore":0-100,"engagementScore":0-100,"emotionalScore":0-100,' +
            '"shareabilityScore":0-100,"completenessScore":0-100}]}',
        },
        {
          role: 'user',
          content: `Patterns:\n${patternList || '(none)'}\n\nSegments:\n${segmentList}\n\nReturn up to ${maxClips} best clips.`,
        },
      ],
    }),
  })
  if (!res.ok) {
    console.warn(`  AI analysis failed (${res.status}); falling back to pattern heuristics.`)
    return null
  }
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>
  }
  try {
    const parsed = JSON.parse(data.choices[0].message.content) as {
      clips: Array<{
        start: number
        end: number
        title: string
        hook: string
        topic: string
        category: string
        patternId: string | null
        hookScore: number
        engagementScore: number
        emotionalScore: number
        shareabilityScore: number
        completenessScore: number
      }>
    }
    const patternMap = new Map(patterns.map((p) => [p.id, p]))
    return parsed.clips
      .filter((c) => c.end > c.start)
      .slice(0, maxClips)
      .map((c) => {
        const pattern = c.patternId ? (patternMap.get(c.patternId) ?? null) : null
        const patternScore = pattern?.score ?? 40
        const score =
          c.hookScore * 0.25 +
          c.engagementScore * 0.2 +
          patternScore * 0.25 +
          c.emotionalScore * 0.1 +
          c.shareabilityScore * 0.1 +
          c.completenessScore * 0.1
        return {
          start: c.start,
          end: c.end,
          title: c.title,
          hook: c.hook,
          topic: c.topic,
          category: c.category,
          patternId: pattern?.id ?? null,
          patternName: pattern?.name ?? null,
          patternScore,
          hookScore: c.hookScore,
          engagementScore: c.engagementScore,
          emotionalScore: c.emotionalScore,
          shareabilityScore: c.shareabilityScore,
          completenessScore: c.completenessScore,
          score,
        }
      })
  } catch {
    console.warn('  AI returned malformed JSON; falling back to pattern heuristics.')
    return null
  }
}

async function findBroll(query: string): Promise<BrollConfigItem | null> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return null
  const res = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=1`,
    { headers: { Authorization: key } },
  ).catch(() => null)
  if (!res?.ok) return null
  const data = (await res.json()) as {
    videos: Array<{ id: number; video_files: Array<{ link: string; quality: string }> }>
  }
  const video = data.videos[0]
  const file = video?.video_files.find((f) => f.quality === 'hd') ?? video?.video_files[0]
  if (!file) return null
  return { videoUrl: file.link, startAt: 0, duration: 3, provider: 'pexels', query }
}

async function findMusic(topic: string): Promise<MusicConfig | null> {
  const clientId = process.env.JAMENDO_CLIENT_ID
  if (!clientId) return null
  const params = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    limit: '1',
    audioformat: 'mp32',
    tags: 'instrumental',
    search: topic,
  })
  const res = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`).catch(() => null)
  if (!res?.ok) return null
  const data = (await res.json()) as {
    results: Array<{ id: string; name: string; audio: string }>
  }
  const track = data.results[0]
  if (!track?.audio) return null
  return {
    audioUrl: track.audio,
    volume: 0.12,
    fadeIn: 1,
    fadeOut: 1.5,
    trimStart: 0,
    title: track.name,
  }
}

function buildConfiguration(
  project: ProjectRow,
  storagePath: string,
  candidate: Candidate,
  words: Word[],
  broll: BrollConfigItem | null,
  music: MusicConfig | null,
): ClipConfiguration {
  const clipWords: CaptionWordConfig[] = words
    .filter((w) => w.start >= candidate.start && w.end <= candidate.end)
    .map((w) => ({ text: w.text, start: w.start, end: w.end }))

  return {
    sourceVideo: storagePath,
    startTime: candidate.start,
    endTime: candidate.end,
    aspectRatio: '9:16',
    resolution: { width: 1080, height: 1920 },
    speed: 1,
    crop: { mode: 'smart', x: 0.5, y: 0.5, scale: 1, subject: 'speaker' },
    captions: {
      enabled: true,
      style: {
        preset: (project.caption_preset || 'bold') as ClipConfiguration['captions']['style']['preset'],
        font: 'Inter',
        fontSize: 64,
        weight: 800,
        position: 'bottom',
        animation: 'pop',
        highlightColor: '#f97316',
        textColor: '#ffffff',
        background: null,
        strokeColor: '#000000',
        strokeWidth: 8,
        alignment: 'center',
        lineSpacing: 1.2,
      },
      words: clipWords,
    },
    broll: broll ? [{ ...broll, startAt: Math.min(3, (candidate.end - candidate.start) / 3) }] : [],
    music,
    overlays: [],
    branding: { logoUrl: null, watermarkText: null },
    voiceVolume: 1,
  }
}

async function processProject(project: ProjectRow): Promise<void> {
  console.log(`Processing project ${project.id} (${project.name})...`)
  const workDir = mkdtempSync(path.join(tmpdir(), 'clipforge-pipeline-'))
  try {
    const videoPath = await downloadSource(project, workDir)
    const meta = await probeVideo(videoPath)
    await supabase
      .from('videos')
      .update({ duration: meta.duration, width: meta.width, height: meta.height })
      .eq('project_id', project.id)

    const audioPath = await extractAudio(project.id, videoPath, workDir)
    const transcript = await transcribe(project.id, audioPath)

    await supabase.from('transcripts').delete().eq('project_id', project.id)
    const { error: transcriptError } = await supabase.from('transcripts').insert({
      project_id: project.id,
      language: transcript.language,
      full_text: transcript.fullText,
      segments: transcript.segments.map((s) => ({
        ...s,
        words: transcript.words.filter((w) => w.start >= s.start && w.end <= s.end),
      })),
    })
    if (transcriptError) throw new Error(`Transcript save failed: ${transcriptError.message}`)

    await setStatus(project.id, 'MATCHING_PATTERNS', 45)
    let patterns: PatternRow[] = []
    if (project.pattern_set_id) {
      const { data } = await supabase
        .from('patterns')
        .select('id, name, category, start_signal, end_signal, score, keywords, is_active')
        .eq('pattern_set_id', project.pattern_set_id)
        .eq('is_active', true)
      patterns = (data ?? []) as PatternRow[]
    }

    await setStatus(project.id, 'FINDING_CLIPS', 55)
    let candidates: Candidate[] | null = null
    if (project.ai_optimization) {
      await setStatus(project.id, 'ANALYZING', 50)
      candidates = await aiCandidates(
        transcript.fullText,
        transcript.segments,
        patterns,
        project.clip_duration_preset,
        project.max_clips,
      )
    }
    if (!candidates || candidates.length === 0) {
      candidates = heuristicCandidates(
        transcript.segments,
        patterns,
        project.clip_duration_preset,
        project.max_clips,
      )
    }
    if (candidates.length === 0) {
      throw new Error('No clip candidates found in this video.')
    }

    await setStatus(project.id, 'GENERATING_CONFIG', 65)
    const { data: videoRow } = await supabase
      .from('videos')
      .select('storage_path')
      .eq('project_id', project.id)
      .maybeSingle()
    const storagePath = (videoRow as { storage_path: string | null } | null)?.storage_path
    if (!storagePath) throw new Error('Source video has no storage path.')

    if (project.auto_broll) await setStatus(project.id, 'FINDING_BROLL', 70)
    if (project.auto_music) await setStatus(project.id, 'ADDING_MUSIC', 75)

    for (const candidate of candidates) {
      const broll = project.auto_broll ? await findBroll(candidate.topic) : null
      const music = project.auto_music ? await findMusic(candidate.topic) : null
      const config = buildConfiguration(project, storagePath, candidate, transcript.words, broll, music)

      const { data: clip, error: clipError } = await supabase
        .from('clips')
        .insert({
          project_id: project.id,
          title: candidate.title,
          hook: candidate.hook,
          topic: candidate.topic,
          category: candidate.category,
          start_time: candidate.start,
          end_time: candidate.end,
          duration: candidate.end - candidate.start,
          score: candidate.score,
          hook_score: candidate.hookScore,
          engagement_score: candidate.engagementScore,
          pattern_score: candidate.patternScore,
          emotional_score: candidate.emotionalScore,
          shareability_score: candidate.shareabilityScore,
          completeness_score: candidate.completenessScore,
          matched_pattern_id: candidate.patternId,
          matched_pattern_name: candidate.patternName,
          status: 'DETECTED',
        })
        .select('id')
        .single()
      if (clipError || !clip) throw new Error(`Clip insert failed: ${clipError?.message}`)

      const { data: version, error: versionError } = await supabase
        .from('clip_versions')
        .insert({
          clip_id: clip.id,
          version_number: 1,
          configuration_json: config,
          status: 'QUEUED',
        })
        .select('id')
        .single()
      if (versionError || !version) {
        throw new Error(`Version insert failed: ${versionError?.message}`)
      }

      const { error: jobError } = await supabase.from('render_jobs').insert({
        clip_id: clip.id,
        clip_version_id: version.id,
        status: 'QUEUED',
      })
      if (jobError) throw new Error(`Render job insert failed: ${jobError.message}`)

      await supabase
        .from('clips')
        .update({ current_version_id: version.id, status: 'RENDERING' })
        .eq('id', clip.id)
    }

    await setStatus(project.id, 'RENDERING', 85)
    await setStatus(project.id, 'COMPLETED', 100)
    console.log(`Project ${project.id} completed with ${candidates.length} clips.`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Project ${project.id} failed:`, message)
    await setStatus(project.id, 'FAILED', 0, message)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

async function claimNextProject(): Promise<ProjectRow | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('status', 'QUEUED')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('Failed to poll projects:', error.message)
    return null
  }
  if (!data) return null

  const { data: claimed, error: claimError } = await supabase
    .from('projects')
    .update({ status: 'DOWNLOADING' })
    .eq('id', data.id)
    .eq('status', 'QUEUED')
    .select('*')
    .maybeSingle()
  if (claimError || !claimed) return null
  return claimed as ProjectRow
}

async function main(): Promise<void> {
  console.log('ClipForge pipeline worker started. Polling for QUEUED projects...')
  for (;;) {
    try {
      const project = await claimNextProject()
      if (project) {
        await processProject(project)
        continue
      }
    } catch (err) {
      console.error('Pipeline loop error:', err)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

void main()
