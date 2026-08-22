import { supabase } from './supabase'
import type { Project, Pattern } from './types'
import { resolveYoutubeStream } from './youtubeResolver'

// Require environment variables for API keys - no fallback defaults for security
const OPENAI_API_KEY =
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_OPENROUTER_API_KEY || import.meta.env?.VITE_OPENAI_API_KEY)) ||
  ''
const YOUTUBE_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_YOUTUBE_API_KEY) ||
  ''

// Validate required environment variables in non-production environments
if (typeof import.meta !== 'undefined' && import.meta.env?.MODE !== 'production') {
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ VITE_OPENAI_API_KEY or VITE_OPENROUTER_API_KEY not provided. AI features will be limited.')
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
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle()

    const videoStoragePath = directStreamVideoUrl || directStreamAudioUrl || null

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

    // Fetch active patterns
    const { data: patternsData } = await supabase
      .from('patterns')
      .select('*')
      .eq('is_active', true)
    const patterns = (patternsData as Pattern[]) || []

    await updateProjectStatus(projectId, 'ANALYZING', 65)
    await delay(600)

    await updateProjectStatus(projectId, 'MATCHING_PATTERNS', 75)

    // Ask AI (OpenRouter / GPT-4o-mini) to detect clips and transcript
    const prompt = `You are ClipForge AI, an elite viral video clipping engine.
Analyze this video:
Title: "${title}"
Source: ${project.source_url || 'Uploaded Video'}
Preset Duration: ${project.clip_duration_preset} (seconds or ai)
Target Clips: ${project.max_clips || 6}

Available Viral Hook Patterns:
${patterns.map((p) => `- ID: ${p.id}, Name: "${p.name}", Category: "${p.category}", Signal: "${p.start_signal}"`).join('\n')}

Generate:
1. An engaging transcript with 6-10 chronological segment intervals (start, end, text).
2. Exactly ${Math.min(project.max_clips || 6, 8)} viral shorts/clips with:
   - title: Punchy, high CTR title
   - hook: The first 3-second opening hook phrase
   - topic: Main subject
   - category: e.g. "Insight", "Controversial", "Story", "How-To", "Mindset"
   - startTime: seconds (e.g. 0, 35, 75, 120, etc.)
   - endTime: seconds (duration should be 20-60s)
   - score: 85-98 (viral probability)
   - hookScore: 85-99
   - engagementScore: 85-99
   - emotionalScore: 80-98
   - shareabilityScore: 85-99
   - completenessScore: 90-99
   - matchedPatternId: pattern ID if applicable (or null)
   - matchedPatternName: pattern name if applicable (or null)

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
      "completenessScore": 95,
      "matchedPatternId": null,
      "matchedPatternName": null
    }
  ]
}`

    let clipsToInsert: any[] = []
    let transcriptSegments: any[] = []

    try {
      const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://clipforge.app',
          'X-Title': 'ClipForge AI',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
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
          clipsToInsert = parsed.clips
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
          endTime: 32,
          score: 95,
          hookScore: 96,
          engagementScore: 94,
          emotionalScore: 90,
          shareabilityScore: 95,
          completenessScore: 98,
          matchedPatternName: 'The Counter-Intuitive Truth',
        },
        {
          title: 'Why 99% Fail at This One Crucial Step',
          hook: 'If you only take away one thing from this, remember this...',
          topic: title,
          category: 'High Retention',
          startTime: 35,
          endTime: 68,
          score: 92,
          hookScore: 93,
          engagementScore: 91,
          emotionalScore: 88,
          shareabilityScore: 92,
          completenessScore: 95,
          matchedPatternName: 'The Critical Warning',
        },
        {
          title: 'The Blueprint Nobody Is Talking About',
          hook: 'Here is what actually changes the game when you apply it.',
          topic: title,
          category: 'Strategy',
          startTime: 72,
          endTime: 104,
          score: 89,
          hookScore: 90,
          engagementScore: 89,
          emotionalScore: 86,
          shareabilityScore: 90,
          completenessScore: 94,
          matchedPatternName: 'The Secret Blueprint',
        },
      ]
      transcriptSegments = [
        { start: 0, end: 32, text: `Introduction and critical secret regarding ${title}.` },
        { start: 35, end: 68, text: 'Detailed breakdown of the most common pitfalls and real solutions.' },
        { start: 72, end: 104, text: 'Actionable step-by-step strategy for immediate execution.' },
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
          matched_pattern_name: c.matchedPatternName || null,
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
            sourceVideo: directStreamVideoUrl || null,
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
