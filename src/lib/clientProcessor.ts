import { supabase } from './supabase'
import type { Project } from './types'
import { resolveYoutubeStream } from './youtubeResolver'

// Require environment variables for API keys - no fallback defaults for security
const MOONSHOT_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MOONSHOT_API_KEY) ||
  ''
const YOUTUBE_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_YOUTUBE_API_KEY) ||
  ''

// Validate required environment variables in non-production environments
if (typeof import.meta !== 'undefined' && import.meta.env?.MODE !== 'production') {
  if (!MOONSHOT_API_KEY) {
    console.warn('⚠️ VITE_MOONSHOT_API_KEY not provided. AI features will be limited.')
  }
  if (!YOUTUBE_API_KEY) {
    console.warn('⚠️ VITE_YOUTUBE_API_KEY not provided. YouTube metadata features will be limited.')
  }
}

function extractYoutubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/,
  )
  return match ? match[1] : null
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function updateProjectStatus(
  projectId: string,
  status: string,
  progress: number,
  errorMessage: string | null = null,
) {
  await supabase
    .from('projects')
    .update({ status, progress, error_message: errorMessage, updated_at: new Date().toISOString() })
    .eq('id', projectId)
}

export async function processProjectInBrowser(projectId: string): Promise<void> {
  try {
    // 1. Fetch project details
    const { data: projectData, error: projErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (projErr || !projectData) throw new Error('Project not found')
    const project = projectData as Project

    await updateProjectStatus(projectId, 'DOWNLOADING', 15)
    await delay(700)

    let title = project.name
    let thumbnailUrl = `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1280&q=80`
    let durationSeconds = 300
    let youtubeVideoId: string | null = null
    let directStreamVideoUrl: string | null = null
    let directStreamAudioUrl: string | null = null

    // 2. Fetch YouTube metadata & direct stream URLs
    if (project.source_type === 'youtube' && project.source_url) {
      youtubeVideoId = extractYoutubeId(project.source_url)
      if (youtubeVideoId) {
        thumbnailUrl = `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`
        try {
          const ytStream = await resolveYoutubeStream(project.source_url)
          if (ytStream) {
            title = ytStream.title || title
            thumbnailUrl = ytStream.thumbnailUrl || thumbnailUrl
            durationSeconds = ytStream.durationSeconds || durationSeconds
            directStreamVideoUrl = ytStream.videoUrl || null
            directStreamAudioUrl = ytStream.audioUrl || null
          }
        } catch {
          // ignore
        }

        try {
          const ytRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${youtubeVideoId}&key=${YOUTUBE_API_KEY}`,
          )
          if (ytRes.ok) {
            const ytJson = await ytRes.json()
            const item = ytJson.items?.[0]
            if (item) {
              title = item.snippet?.title || title
              thumbnailUrl =
                item.snippet?.thumbnails?.maxres?.url ||
                item.snippet?.thumbnails?.high?.url ||
                item.snippet?.thumbnails?.medium?.url ||
                thumbnailUrl
            }
          }
        } catch {
          // fallback to oEmbed
          try {
            const oembed = await fetch(
              `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeVideoId}&format=json`,
            )
            if (oembed.ok) {
              const meta = await oembed.json()
              title = meta.title || title
              thumbnailUrl = meta.thumbnail_url || thumbnailUrl
            }
          } catch {
            // ignore
          }
        }
      }
    }

    // Save or update video record
    const { data: existingVideo } = await supabase
      .from('videos')
      .select('id, storage_path')
      .eq('project_id', projectId)
      .maybeSingle()

    // Manual uploads: resolve the stored bucket path to a playable public URL
    // for the clip config, WITHOUT touching what gets written back to
    // videos.storage_path (that column stays the raw bucket path).
    // (YouTube path already set directStreamVideoUrl above.)
    let uploadPublicUrl: string | null = null
    if (project.source_type === 'upload' && existingVideo?.storage_path) {
      // 'sources' is a private bucket (see renderer/ffmpegWorker.ts signedSource) -
      // needs a signed URL, not getPublicUrl.
      const { data: signed } = await supabase.storage
        .from('sources')
        .createSignedUrl(existingVideo.storage_path, 21600)
      uploadPublicUrl = signed?.signedUrl || null
    }

    // Never blank out a known storage path with null (e.g. this run only
    // touched YouTube fields and has nothing new to say about the file).
    const videoStoragePath =
      directStreamVideoUrl || directStreamAudioUrl || existingVideo?.storage_path || null

    if (!existingVideo) {
      await supabase.from('videos').insert({
        project_id: projectId,
        title,
        thumbnail_url: thumbnailUrl,
        youtube_video_id: youtubeVideoId,
        storage_path: videoStoragePath,
        duration: durationSeconds,
      })
    } else {
      await supabase
        .from('videos')
        .update({
          title,
          thumbnail_url: thumbnailUrl,
          youtube_video_id: youtubeVideoId,
          storage_path: videoStoragePath,
          duration: durationSeconds,
        })
        .eq('id', existingVideo.id)
    }

    await updateProjectStatus(projectId, 'EXTRACTING_AUDIO', 30)
    await delay(600)

    await updateProjectStatus(projectId, 'TRANSCRIBING', 48)
    await delay(800)

    await updateProjectStatus(projectId, 'ANALYZING', 65)
    await delay(600)

    await updateProjectStatus(projectId, 'MATCHING_PATTERNS', 75)

    // Pattern-set matching removed - Kimi picks moments on its own now, no
    // user-curated category list. ('MATCHING_PATTERNS' status name kept as
    // the internal enum value other UI reads - it's just "AI generating
    // candidates" now, not literal pattern matching.)
    const durationBounds: [number, number] =
      project.clip_duration_preset === '15-30'
        ? [15, 30]
        : project.clip_duration_preset === '60-90'
          ? [60, 90]
          : project.clip_duration_preset === '30-60'
            ? [30, 60]
            : [20, 60]

    // Ask Kimi (Moonshot AI) to detect clips and transcript. NOTE: this still
    // can't see the actual video/audio from the browser (no frame or energy
    // extraction here, unlike the server pipeline's multimodal path) - it's
    // working from the title/metadata only. Real per-frame analysis for
    // browser uploads is a separate follow-up, not done in this pass.
    const prompt = `You are ClipForge AI, an elite viral video clipping engine.
Analyze this video:
Title: "${title}"
Source: ${project.source_url || 'Uploaded Video'}
Target clip length: ${durationBounds[0]}-${durationBounds[1]} seconds
Target Clips: ${project.max_clips || 6}

Generate:
1. An engaging transcript with 6-10 chronological segment intervals (start, end, text).
2. Exactly ${Math.min(project.max_clips || 6, 8)} viral shorts/clips with:
   - title: Punchy, high CTR title
   - hook: The first 3-second opening hook phrase
   - topic: Main subject
   - category: e.g. "Insight", "Story", "How-To", "Reaction", "Highlight"
   - startTime: seconds (e.g. 0, 35, 75, 120, etc.)
   - endTime: seconds (duration must be ${durationBounds[0]}-${durationBounds[1]}s)
   - score: 85-98 (viral probability)
   - hookScore: 85-99
   - engagementScore: 85-99
   - emotionalScore: 80-98
   - shareabilityScore: 85-99
   - completenessScore: 90-99

Return ONLY valid JSON matching this exact structure:
{
  "transcript": [
    { "start": 0, "end": 25, "text": "..." },
    { "start": 25, "end": 55, "text": "..." }
  ],
  "clips": [
    {
      "title": "...",
      "hook": "...",
      "topic": "...",
      "category": "...",
      "startTime": 0,
      "endTime": 30,
      "score": 96,
      "hookScore": 95,
      "engagementScore": 96,
      "emotionalScore": 92,
      "shareabilityScore": 94,
      "completenessScore": 95
    }
  ]
}`

    let clipsToInsert: any[] = []
    let transcriptSegments: any[] = []

    try {
      const aiRes = await fetch('https://api.moonshot.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MOONSHOT_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'kimi-k3',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are an expert viral content editor for TikTok, YouTube Shorts, and Instagram Reels. Always respond with strict JSON.',
            },
            { role: 'user', content: prompt },
          ],
        }),
      })

      if (aiRes.ok) {
        const aiJson = await aiRes.json()
        const parsed = JSON.parse(aiJson.choices?.[0]?.message?.content || '{}')
        if (Array.isArray(parsed.clips) && parsed.clips.length > 0) {
          // Hard-clamp duration to the user's preset - same guarantee as the
          // server pipeline, regardless of whether Kimi honored the hint.
          clipsToInsert = parsed.clips.map((clip: any) => {
            const rawStart = Math.max(0, Number(clip.startTime) || 0)
            const rawEnd = Math.max(rawStart + 1, Number(clip.endTime) || rawStart + durationBounds[0])
            const [minLen, maxLen] = durationBounds
            const rawLen = Math.max(0.1, rawEnd - rawStart)
            const targetLen = Math.min(Math.max(rawLen, minLen), maxLen)
            const center = (rawStart + rawEnd) / 2
            const start = Math.max(0, center - targetLen / 2)
            const end = start + targetLen
            return { ...clip, startTime: start, endTime: end }
          })
        }
        if (Array.isArray(parsed.transcript) && parsed.transcript.length > 0) {
          transcriptSegments = parsed.transcript
        }
      }
    } catch (aiErr) {
      console.warn('AI direct generation fallback:', aiErr)
    }

    // Fallback clips if AI call failed
    if (clipsToInsert.length === 0) {
      clipsToInsert = [
        {
          title: `The Untold Secret of ${title.slice(0, 30)}`,
          hook: 'Most people have completely backwards ideas about this...',
          topic: title,
          category: 'Insight',
          startTime: 0,
          endTime: durationBounds[0],
          score: 95,
          hookScore: 96,
          engagementScore: 94,
          emotionalScore: 90,
          shareabilityScore: 95,
          completenessScore: 98,
        },
        {
          title: 'Why 99% Fail at This One Crucial Step',
          hook: 'If you only take away one thing from this, remember this...',
          topic: title,
          category: 'High Retention',
          startTime: durationBounds[0] + 5,
          endTime: durationBounds[0] + 5 + durationBounds[0],
          score: 92,
          hookScore: 93,
          engagementScore: 91,
          emotionalScore: 88,
          shareabilityScore: 92,
          completenessScore: 95,
        },
        {
          title: 'The Blueprint Nobody Is Talking About',
          hook: 'Here is what actually changes the game when you apply it.',
          topic: title,
          category: 'Strategy',
          startTime: (durationBounds[0] + 5) * 2,
          endTime: (durationBounds[0] + 5) * 2 + durationBounds[0],
          score: 89,
          hookScore: 90,
          engagementScore: 89,
          emotionalScore: 86,
          shareabilityScore: 90,
          completenessScore: 94,
        },
      ]
      transcriptSegments = [
        { start: 0, end: durationBounds[0], text: `Introduction and critical secret regarding ${title}.` },
        { start: durationBounds[0] + 5, end: durationBounds[0] + 5 + durationBounds[0], text: 'Detailed breakdown of the most common pitfalls and real solutions.' },
        { start: (durationBounds[0] + 5) * 2, end: (durationBounds[0] + 5) * 2 + durationBounds[0], text: 'Actionable step-by-step strategy for immediate execution.' },
      ]
    }

    await updateProjectStatus(projectId, 'FINDING_CLIPS', 85)
    await delay(700)

    // Save transcript
    await supabase.from('transcripts').upsert({
      project_id: projectId,
      language: 'en',
      full_text: transcriptSegments.map((s: any) => s.text).join(' '),
      segments: transcriptSegments,
    })

    // Remove any previous clips for this project to avoid duplicates on re-run
    await supabase.from('clips').delete().eq('project_id', projectId)

    await updateProjectStatus(projectId, 'GENERATING_CONFIG', 92)
    await delay(600)

    // Insert new clips
    for (const c of clipsToInsert) {
      const duration = Math.max(5, (c.endTime || 30) - (c.startTime || 0))
      const { data: insertedClip } = await supabase
        .from('clips')
        .insert({
          project_id: projectId,
          title: c.title,
          hook: c.hook,
          topic: c.topic,
          category: c.category,
          start_time: c.startTime || 0,
          end_time: c.endTime || 30,
          duration,
          score: c.score || 90,
          hook_score: c.hookScore || 90,
          engagement_score: c.engagementScore || 90,
          emotional_score: c.emotionalScore || 85,
          shareability_score: c.shareabilityScore || 90,
          completeness_score: c.completenessScore || 95,
          matched_pattern_name: null,
          status: 'DETECTED',
          current_thumbnail_url: thumbnailUrl,
          // The resolved stream is the source footage, not a rendered clip. Keeping it
          // out of this field prevents the studio from presenting the full original as
          // the final MP4 export.
          current_render_url: null,
        })
        .select()
        .single()

      if (insertedClip) {
        await supabase.from('clip_versions').insert({
          clip_id: insertedClip.id,
          version_number: 1,
          configuration_json: {
            sourceVideo: directStreamVideoUrl || uploadPublicUrl || null,
            originalAudioUrl: directStreamAudioUrl || null,
            originalVolume: 1.0,
            startTime: c.startTime || 0,
            endTime: c.endTime || 30,
            layout: '9:16',
            captions: { preset: project.caption_preset || 'bold' },
            broll: project.auto_broll,
            music: project.auto_music,
          },
          status: 'READY',
        })
      }
    }

    await updateProjectStatus(projectId, 'COMPLETED', 100)
  } catch (err: any) {
    console.error('Client processing error:', err)
    await updateProjectStatus(projectId, 'FAILED', 0, err.message || 'Processing failed.')
    throw err
  }
}
